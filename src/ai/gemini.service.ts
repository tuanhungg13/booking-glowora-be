import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GoogleGenerativeAI,
  Content,
} from '@google/generative-ai';
import { StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PLATFORM_GUIDE = (() => {
  try {
    return readFileSync(join(__dirname, 'platform-guide.md'), 'utf-8');
  } catch {
    return '';
  }
})();

export interface PlatformContext {
  categories: string;
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
    userLocation?: { lat: number; lng: number; cityName?: string | null },
  ): Promise<{ reply: string; suggestedKeywords: string[] }> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: this.buildPlatformPrompt(ctx, userLocation),
      });

      const geminiHistory: Content[] = history.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(userMessage);
      const text = result.response.text();

      const suggestMatch = text.match(/\[SUGGEST_KW:([^\]]+)\]/);
      const suggestedKeywords = suggestMatch
        ? suggestMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const reply = text.replace(/\[SUGGEST_KW:[^\]]+\]/, '').trim();

      return { reply, suggestedKeywords };
    } catch (err) {
      this.logger.error('Gemini platform chat error', err);
      return { reply: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.', suggestedKeywords: [] };
    }
  }

  async fetchServicesByKeywords(keywords: string[]): Promise<PlatformServiceSuggestion[]> {
    if (!keywords.length) return [];

    const orConditions = keywords.flatMap((kw) => [
      { name: { contains: kw, mode: 'insensitive' as const } },
      { description: { contains: kw, mode: 'insensitive' as const } },
    ]);

    const services = await this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        store: { status: StoreStatus.ACTIVE },
        OR: orConditions,
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
        select: { name: true },
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
      storeCount,
      cityOverview,
    };
  }

  private buildPlatformPrompt(ctx: PlatformContext, userLocation?: { lat: number; lng: number; cityName?: string | null }): string {
    const locationLine = userLocation
      ? `- Vị trí hiện tại của người dùng: ${userLocation.cityName ? userLocation.cityName + ` (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})` : `tọa độ ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`}`
      : '- Vị trí người dùng: chưa cung cấp';

    return `Bạn là trợ lý AI của Glowora — nền tảng đặt lịch dịch vụ làm đẹp trực tuyến.

Thông tin nền tảng:
- Tổng số cửa hàng đang hoạt động: ${ctx.storeCount}
- Danh mục dịch vụ: ${ctx.categories}
- Phân bố cửa hàng theo thành phố: ${ctx.cityOverview}
${locationLine}

Nhiệm vụ của bạn:
1. Giúp khách hàng tìm kiếm dịch vụ và cửa hàng phù hợp với nhu cầu.
2. Tư vấn tổng quan về các dịch vụ làm đẹp phổ biến.
3. Hướng dẫn khách hàng và chủ spa/nhân viên sử dụng nền tảng (đặt lịch, tạo coupon, mời nhân viên, v.v.).

Quy tắc bắt buộc:
1. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
2. Khi khách mô tả vấn đề về da/tóc/sắc đẹp, KHÔNG gợi ý dịch vụ ngay — hãy hỏi thêm 1-2 câu để hiểu rõ nhu cầu. Chỉ gợi ý dịch vụ sau khi đã có đủ thông tin hoặc khách hỏi thẳng.
3. Nếu khách hỏi chi tiết về một cửa hàng cụ thể → hướng dẫn họ vào trang của cửa hàng đó để xem thông tin và chat trực tiếp với nhân viên.
4. Không bịa thông tin không có trong dữ liệu.
5. Không tư vấn y tế chuyên sâu.
6. Chỉ thêm tag [SUGGEST_KW:keyword1,keyword2,keyword3] ở DÒNG CUỐI (không xuống dòng) khi đã tư vấn đủ và muốn gợi ý dịch vụ cụ thể. KHÔNG thêm khi chào hỏi, hỏi làm rõ, hoặc hỏi thông tin chung.
   - Keywords là cụm từ tiếng Việt ngắn (1-4 từ) mô tả chính xác dịch vụ người dùng cần. Ví dụ: "massage vai cổ", "chăm sóc da mụn", "triệt lông nách", "uốn tóc xoăn"
   - Chọn tối đa 3 keywords, càng cụ thể với nhu cầu người dùng càng tốt
   - Tag này ẩn — KHÔNG hiển thị ra câu trả lời người dùng đọc

---

## Tài liệu hướng dẫn nền tảng (dùng để trả lời câu hỏi về cách sử dụng)

${PLATFORM_GUIDE}`;
  }

}
