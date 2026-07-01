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
  ): Promise<{ reply: string; suggestedKeywords: string[]; suggestedStoreKeywords: string[]; suggestedLocationKeywords: string[] }> {
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

      const locationMatch = text.match(/\[SUGGEST_LOCATION:([^\]]+)\]/);
      const suggestedLocationKeywords = locationMatch
        ? locationMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const reply = text
        .replace(/\[SUGGEST_KW:[^\]]+\]/, '')
        .replace(/\[SUGGEST_STORE:[^\]]+\]/, '')
        .replace(/\[SUGGEST_LOCATION:[^\]]+\]/, '')
        .trim();

      return { reply, suggestedKeywords, suggestedStoreKeywords, suggestedLocationKeywords };
    } catch (err) {
      this.logger.error('Gemini platform chat error', err);
      return { reply: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.', suggestedKeywords: [], suggestedStoreKeywords: [], suggestedLocationKeywords: [] };
    }
  }

  // Gọi lại Gemini lần 2 khi truy vấn cửa hàng theo địa điểm + dịch vụ trả về rỗng,
  // để AI viết lại câu trả lời dựa trên dữ liệu THẬT thay vì lời chào chung chung ở lượt 1.
  async composeNoStoreFoundReply(
    userMessage: string,
    serviceKeywords: string[],
    locationLabel: string,
    elsewhereStores: PlatformStoreSuggestion[],
    ctx: PlatformContext,
  ): Promise<string> {
    const elsewhereProvinces = Array.from(
      new Set(elsewhereStores.map((s) => s.provinceName).filter((p): p is string => !!p)),
    );
    const serviceLabel = serviceKeywords.filter((k) => k !== '__top_rated__').join(', ') || 'dịch vụ khách vừa hỏi';

    const factSummary = elsewhereProvinces.length
      ? `Không có cửa hàng nào ở ${locationLabel} khớp yêu cầu "${serviceLabel}", nhưng dịch vụ này đang có tại các tỉnh/thành: ${elsewhereProvinces.join(', ')}.`
      : `Không có cửa hàng nào trên toàn nền tảng khớp yêu cầu dịch vụ "${serviceLabel}".`;

    const prompt = `Bạn là trợ lý AI của Glowora — nền tảng đặt lịch dịch vụ làm đẹp trực tuyến.

Người dùng vừa hỏi: "${userMessage}"

Dữ liệu thực tế tra cứu được (đây là SỰ THẬT, phải bám sát, không được thêm số liệu hay địa điểm nào khác): ${factSummary}
Danh mục dịch vụ đang có trên nền tảng: ${ctx.categories}

Viết lại một câu trả lời ngắn gọn, thân thiện bằng tiếng Việt cho người dùng dựa ĐÚNG trên dữ liệu thực tế trên:
- Nếu có tỉnh/thành khác đang cung cấp dịch vụ, nói rõ ràng dịch vụ này hiện có ở đâu.
- Nếu không có ở đâu cả, xin lỗi và gợi ý 2-3 danh mục dịch vụ khác đang có trên nền tảng để khách tham khảo.
Chỉ trả về đúng câu trả lời, không thêm giải thích hay tag nào khác.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      this.logger.error('Gemini compose no-result reply error', err);
      return factSummary;
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
    storeKeywords: string[],
    locationKeywords: string[],
    userLocation?: { lat: number; lng: number },
  ): Promise<PlatformStoreSuggestion[]> {
    const NEAR_ME = '__near_me__';
    const TOP_RATED = '__top_rated__';

    const topRated = storeKeywords.includes(TOP_RATED);
    const serviceKws = storeKeywords.filter((k) => k !== TOP_RATED);

    const nearMe = locationKeywords.includes(NEAR_ME);
    const locationKws = locationKeywords.filter((k) => k !== NEAR_ME);

    if (!serviceKws.length && !locationKws.length && !topRated && !nearMe) return [];

    const sortByDistance = nearMe && !!userLocation;

    const storeSelect = {
      id: true, name: true, slug: true, logoUrl: true,
      avgRating: true, totalReviews: true, address: true,
      latitude: true, longitude: true,
      province: { select: { name: true } },
    };

    // Nhóm điều kiện dịch vụ và nhóm điều kiện địa điểm tách biệt, AND với nhau
    // → store phải vừa đúng dịch vụ vừa đúng địa điểm, không còn nhánh nới lỏng ngầm
    const buildServiceConditions = (kws: string[]) => kws.map((kw) => ({
      OR: [
        { name: { contains: kw } },
        { description: { contains: kw } },
        { services: { some: { name: { contains: kw }, status: ServiceStatus.ACTIVE } } },
        { services: { some: { description: { contains: kw }, status: ServiceStatus.ACTIVE } } },
      ],
    }));

    const buildLocationConditions = (kws: string[]) => kws.map((kw) => ({
      OR: [
        { address: { contains: kw } },
        { province: { name: { contains: kw } } },
      ],
    }));

    const andConditions = [
      ...buildServiceConditions(serviceKws),
      ...buildLocationConditions(locationKws),
    ];

    const stores = await this.prisma.store.findMany({
      where: {
        status: StoreStatus.ACTIVE,
        ...(andConditions.length ? { AND: andConditions } : {}),
      },
      select: storeSelect,
      orderBy: { avgRating: 'desc' },
      take: sortByDistance ? 50 : 10,
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
4. Không bịa thông tin không có trong dữ liệu. Số liệu "cửa hàng theo tỉnh/thành" chỉ là tổng số cửa hàng active tại đó, KHÔNG có nghĩa là tất cả (hay bất kỳ) cửa hàng nào trong số đó cung cấp đúng loại dịch vụ khách đang hỏi — không được gộp 2 con số này lại thành một khẳng định.
5. Không tư vấn y tế chuyên sâu.
6. Chỉ thêm tag [SUGGEST_KW:keyword1,keyword2,keyword3] ở DÒNG CUỐI (không xuống dòng) khi đã tư vấn đủ và muốn gợi ý dịch vụ cụ thể. KHÔNG thêm khi chào hỏi, hỏi làm rõ, hoặc hỏi thông tin chung.
   - Keywords là cụm từ tiếng Việt ngắn (1-4 từ) mô tả chính xác dịch vụ người dùng cần. Ví dụ: "massage vai cổ", "chăm sóc da mụn", "triệt lông nách", "uốn tóc xoăn"
   - Chọn tối đa 3 keywords, càng cụ thể với nhu cầu người dùng càng tốt
   - Tag này ẩn — KHÔNG hiển thị ra câu trả lời người dùng đọc
7. Chỉ thêm tag [SUGGEST_STORE:keyword1,keyword2] ở DÒNG CUỐI (không xuống dòng) khi khách muốn tìm cửa hàng spa.
   - Keywords là tên spa hoặc loại dịch vụ spa cung cấp (KHÔNG chứa địa điểm — địa điểm dùng tag riêng ở quy tắc 8). Ví dụ: "chăm sóc da mặt", "cắt tóc"
   - Từ khóa đặc biệt __top_rated__: thêm khi khách hỏi "đánh giá cao", "tốt nhất", "uy tín nhất" mà không nêu loại dịch vụ cụ thể — hệ thống trả về top spa theo rating toàn nền tảng (kết hợp với địa điểm ở tag 8 nếu có).
   - Chọn tối đa 2 keywords thường (không tính __top_rated__)
   - Phân biệt với [SUGGEST_KW:...]: dùng [SUGGEST_STORE:...] khi user muốn xem danh sách SPA; dùng [SUGGEST_KW:...] khi user muốn xem chi tiết GIÁ/THỜI GIAN của một dịch vụ cụ thể
   - Tag này ẩn — KHÔNG hiển thị ra câu trả lời người dùng đọc
8. Nếu khách có nêu địa điểm khi tìm spa, hoặc nói "gần tôi", thêm tag [SUGGEST_LOCATION:keyword] ở DÒNG CUỐI (cùng dòng với SUGGEST_STORE nếu có cả hai).
   - Keyword là tên tỉnh/thành phố hoặc quận/huyện. Ví dụ: "Hà Nội", "quận 1"
   - Từ khóa đặc biệt __near_me__: thêm khi khách hỏi "gần tôi", "gần đây", "xung quanh tôi" — hệ thống sort theo khoảng cách GPS thay vì so tên địa điểm.
   - Chỉ chọn 1 địa điểm HOẶC __near_me__, không dùng cả hai cùng lúc.
   - Tag này có thể đứng MỘT MÌNH (không cần SUGGEST_STORE) khi khách chỉ hỏi có spa nào ở một địa điểm, không nêu loại dịch vụ.
   - Ví dụ: "spa chăm sóc da ở Hà Nội" → [SUGGEST_STORE:chăm sóc da][SUGGEST_LOCATION:Hà Nội] | "spa gần tôi" → [SUGGEST_LOCATION:__near_me__] | "spa massage đánh giá cao" → [SUGGEST_STORE:massage,__top_rated__] | "có spa nào ở Đà Nẵng không?" → [SUGGEST_LOCATION:Đà Nẵng]
   - Tag này ẩn — KHÔNG hiển thị ra câu trả lời người dùng đọc

---

## Tài liệu hướng dẫn nền tảng (dùng để trả lời câu hỏi về cách sử dụng)

${PLATFORM_GUIDE}`;
  }

}
