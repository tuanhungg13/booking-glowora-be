import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  Content,
} from '@google/generative-ai';
import { StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PlatformContext {
  categories: string;
  categorySlugRef: string;
  storeCount: number;
  cityOverview: string;
}

export interface PlatformServiceSuggestion {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  avgRating: number;
  storeId: string;
  storeName: string;
  variants: { name: string; price: number; duration: number }[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.config.get<string>('GEMINI_MODEL') ?? 'gemini-2.0-flash-lite';
  }

  async chatGlobal(
    history: ChatMessage[],
    userMessage: string,
    ctx: PlatformContext,
  ): Promise<{ reply: string; suggestedCategorySlugs: string[] }> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: this.buildPlatformPrompt(ctx),
      });

      const geminiHistory: Content[] = history.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(userMessage);
      const text = result.response.text();

      const suggestMatch = text.match(/\[SUGGEST:([\w\-,\s]+)\]/);
      const suggestedCategorySlugs = suggestMatch
        ? suggestMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const reply = text.replace(/\[SUGGEST:[\w\-,\s]+\]/, '').trim();

      return { reply, suggestedCategorySlugs };
    } catch (err) {
      this.logger.error('Gemini platform chat error', err);
      return { reply: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.', suggestedCategorySlugs: [] };
    }
  }

  async fetchServicesByCategories(categorySlugs: string[]): Promise<PlatformServiceSuggestion[]> {
    if (!categorySlugs.length) return [];

    // Match cả top-level category lẫn subcategory (con trực tiếp) của các slug đó
    const matchingCategories = await this.prisma.serviceCategory.findMany({
      where: {
        OR: [
          { slug: { in: categorySlugs } },
          { parent: { slug: { in: categorySlugs } } },
        ],
      },
      select: { id: true },
    });

    const categoryIds = matchingCategories.map((c) => c.id);
    if (!categoryIds.length) return [];

    const services = await this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        categoryId: { in: categoryIds },
        store: { status: StoreStatus.ACTIVE },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrls: true,
        avgRating: true,
        storeId: true,
        store: { select: { name: true } },
        variants: {
          where: { status: 'ACTIVE' },
          select: { name: true, price: true, duration: true },
          orderBy: { sortOrder: 'asc' },
          take: 2,
        },
      },
      orderBy: { avgRating: 'desc' },
      take: 5,
    });

    return services.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      imageUrls: Array.isArray(s.imageUrls) ? (s.imageUrls as string[]) : [],
      imageUrl: Array.isArray(s.imageUrls) ? ((s.imageUrls as string[])[0] ?? null) : null,
      avgRating: Number(s.avgRating),
      storeId: s.storeId,
      storeName: s.store.name,
      variants: s.variants.map((v) => ({
        name: v.name,
        price: Number(v.price),
        duration: v.duration,
      })),
    }));
  }

  async buildPlatformContext(): Promise<PlatformContext> {
    const [categories, storesByProvince] = await Promise.all([
      this.prisma.serviceCategory.findMany({
        where: { storeId: null, parentId: null },
        select: { name: true, slug: true },
        take: 20,
      }),
      this.prisma.store.groupBy({
        by: ['provinceId'],
        where: { status: StoreStatus.ACTIVE },
        _count: { _all: true },
      }),
    ]);

    const provinceIds = storesByProvince
      .map((s) => s.provinceId)
      .filter((id): id is number => id !== null);

    const provinces = provinceIds.length
      ? await this.prisma.province.findMany({
          where: { id: { in: provinceIds } },
          select: { id: true, name: true },
        })
      : [];

    const provinceMap = new Map(provinces.map((p) => [p.id, p.name]));
    const storeCount = storesByProvince.reduce((sum, s) => sum + s._count._all, 0);

    const cityOverview = storesByProvince
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 8)
      .map((s) => `${provinceMap.get(s.provinceId ?? 0) ?? 'Khác'}: ${s._count._all} cửa hàng`)
      .join(', ') || 'Đang cập nhật';

    return {
      categories: categories.map((c) => c.name).join(', ') || 'Đang cập nhật',
      categorySlugRef: categories
        .filter((c) => c.slug)
        .map((c) => `${c.slug}=${c.name}`)
        .join(', '),
      storeCount,
      cityOverview,
    };
  }

  private buildPlatformPrompt(ctx: PlatformContext): string {
    return `Bạn là trợ lý AI của Glowora — nền tảng đặt lịch dịch vụ làm đẹp trực tuyến.

Thông tin nền tảng:
- Tổng số cửa hàng đang hoạt động: ${ctx.storeCount}
- Danh mục dịch vụ: ${ctx.categories}
- Phân bố cửa hàng theo thành phố: ${ctx.cityOverview}

Nhiệm vụ của bạn:
1. Giúp khách hàng tìm kiếm dịch vụ và cửa hàng phù hợp với nhu cầu.
2. Tư vấn tổng quan về các dịch vụ làm đẹp phổ biến.
3. Hướng dẫn khách hàng sử dụng nền tảng (đặt lịch, thanh toán, đánh giá).

Quy tắc bắt buộc:
1. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
2. Khi khách mô tả vấn đề về da/tóc/sắc đẹp, KHÔNG gợi ý dịch vụ ngay — hãy hỏi thêm 1-2 câu để hiểu rõ nhu cầu. Chỉ gợi ý dịch vụ sau khi đã có đủ thông tin hoặc khách hỏi thẳng.
3. Nếu khách hỏi chi tiết về một cửa hàng cụ thể → hướng dẫn họ vào trang của cửa hàng đó để xem thông tin và chat trực tiếp với nhân viên.
4. Không bịa thông tin không có trong dữ liệu.
5. Không tư vấn y tế chuyên sâu.
6. Chỉ thêm tag [SUGGEST:slug1,slug2] ở DÒNG CUỐI khi đã tư vấn đủ và gợi ý dịch vụ cụ thể. KHÔNG thêm khi mới nhận mô tả vấn đề, chào hỏi, hay hỏi thông tin chung. Tối đa 3 danh mục.

Bảng mã slug (CHỈ dùng trong tag [SUGGEST:...], KHÔNG hiển thị ra câu trả lời):
${ctx.categorySlugRef}`;
  }

}
