import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  GoogleGenerativeAI,
  Content,
} from '@google/generative-ai';
import { ServiceStatus, StoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

export interface PlatformStoreSuggestion {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  avgRating: number;
  totalReviews: number;
  address: string;
  provinceName: string | null;
  distanceKm?: number;
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
  ): Promise<{ reply: string; suggestedKeywords: string[]; suggestedStoreKeywords: string[] }> {
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

      const storeMatch = text.match(/\[SUGGEST_STORE:([^\]]+)\]/);
      const suggestedStoreKeywords = storeMatch
        ? storeMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const reply = text
        .replace(/\[SUGGEST_KW:[^\]]+\]/, '')
        .replace(/\[SUGGEST_STORE:[^\]]+\]/, '')
        .trim();

      return { reply, suggestedKeywords, suggestedStoreKeywords };
    } catch (err) {
      this.logger.error('Gemini platform chat error', err);
      return { reply: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.', suggestedKeywords: [], suggestedStoreKeywords: [] };
    }
  }

  async fetchServicesByKeywords(keywords: string[]): Promise<PlatformServiceSuggestion[]> {
    if (!keywords.length) return [];

    const orConditions = keywords.flatMap((kw) => [
      { name: { contains: kw } },
      { description: { contains: kw } },
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

  async fetchStoresByKeywords(
    keywords: string[],
    userLocation?: { lat: number; lng: number },
  ): Promise<PlatformStoreSuggestion[]> {
    const NEAR_ME = '__near_me__';
    const TOP_RATED = '__top_rated__';

    const nearMe = keywords.includes(NEAR_ME);
    const topRated = keywords.includes(TOP_RATED);
    const realKeywords = keywords.filter((k) => k !== NEAR_ME && k !== TOP_RATED);

    if (!realKeywords.length && !nearMe && !topRated) return [];

    const sortByDistance = nearMe && !!userLocation;

    const orConditions = realKeywords.flatMap((kw) => [
      { name: { contains: kw } },
      { description: { contains: kw } },
      { address: { contains: kw } },
      { province: { name: { contains: kw } } },
      { services: { some: { name: { contains: kw }, status: ServiceStatus.ACTIVE } } },
      { services: { some: { description: { contains: kw }, status: ServiceStatus.ACTIVE } } },
    ]);

    const stores = await this.prisma.store.findMany({
      where: {
        status: StoreStatus.ACTIVE,
        ...(realKeywords.length ? { OR: orConditions } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        avgRating: true,
        totalReviews: true,
        address: true,
        latitude: true,
        longitude: true,
        province: { select: { name: true } },
      },
      orderBy: { avgRating: 'desc' },
      // Lấy nhiều hơn khi sort distance để có đủ kết quả sau khi lọc
      take: sortByDistance ? 50 : 3,
    });

    if (sortByDistance && userLocation) {
      return stores
        .filter((s) => s.latitude !== null && s.longitude !== null)
        .map((s) => ({
          ...s,
          distanceKm: haversineKm(userLocation.lat, userLocation.lng, s.latitude!, s.longitude!),
        }))
        .sort((a, b) => a.distanceKm! - b.distanceKm!)
        .slice(0, 3)
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          logoUrl: s.logoUrl,
          avgRating: Number(s.avgRating),
          totalReviews: s.totalReviews,
          address: s.address,
          provinceName: s.province?.name ?? null,
          distanceKm: Math.round(s.distanceKm! * 10) / 10,
        }));
    }

    return stores.slice(0, 3).map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      logoUrl: s.logoUrl,
      avgRating: Number(s.avgRating),
      totalReviews: s.totalReviews,
      address: s.address,
      provinceName: s.province?.name ?? null,
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
7. Chỉ thêm tag [SUGGEST_STORE:keyword1,keyword2] ở DÒNG CUỐI (không xuống dòng) khi khách muốn tìm cửa hàng spa.
   - Keywords là tên tỉnh/thành phố, quận/huyện, tên spa, hoặc loại dịch vụ spa cung cấp. Ví dụ: "Hà Nội", "quận 1", "chăm sóc da mặt", "cắt tóc"
   - Hai từ khóa đặc biệt (không phải địa điểm hay dịch vụ, chỉ là tín hiệu kỹ thuật):
     * __near_me__ : thêm khi khách hỏi "gần tôi", "gần đây", "xung quanh tôi" — hệ thống sẽ sort theo khoảng cách GPS
     * __top_rated__ : thêm khi khách hỏi "đánh giá cao", "tốt nhất", "uy tín nhất" mà không nêu địa điểm hay dịch vụ — hệ thống trả về top spa theo rating toàn nền tảng
   - Ví dụ cách dùng: "spa gần tôi" → [SUGGEST_STORE:__near_me__] | "spa massage đánh giá cao" → [SUGGEST_STORE:massage,__top_rated__] | "spa chăm sóc da gần tôi ở Hà Nội" → [SUGGEST_STORE:chăm sóc da,__near_me__]
   - Chọn tối đa 2 keywords thường (không tính __near_me__ và __top_rated__)
   - Phân biệt với [SUGGEST_KW:...]: dùng [SUGGEST_STORE:...] khi user muốn xem danh sách SPA; dùng [SUGGEST_KW:...] khi user muốn xem chi tiết GIÁ/THỜI GIAN của một dịch vụ cụ thể
   - Có thể kết hợp cả hai tag trong cùng câu trả lời nếu phù hợp
   - Tag này ẩn — KHÔNG hiển thị ra câu trả lời người dùng đọc

---

## Tài liệu hướng dẫn nền tảng (dùng để trả lời câu hỏi về cách sử dụng)

${PLATFORM_GUIDE}`;
  }

}
