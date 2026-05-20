import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  Content,
} from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';

export interface ShopContext {
  storeName: string;
  services: string;
  combos: string;
  workingHours: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY') ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(
    history: ChatMessage[],
    userMessage: string,
    shopContext: ShopContext,
  ): Promise<{ reply: string; escalate: boolean }> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: this.buildSystemPrompt(shopContext),
      });

      const geminiHistory: Content[] = history.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(userMessage);
      const text = result.response.text();

      const escalate = text.includes('[ESCALATE]');
      const reply = text.replace('[ESCALATE]', '').trim();

      return { reply, escalate };
    } catch (err) {
      this.logger.error('Gemini chat error', err);
      return {
        reply:
          'Xin lỗi, tôi đang gặp sự cố. Để được hỗ trợ tốt hơn, hãy để nhân viên của chúng tôi tư vấn cho bạn.',
        escalate: true,
      };
    }
  }

  async buildShopContext(storeId: string): Promise<ShopContext> {
    const [store, services, combos, workingHours] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
      this.prisma.service.findMany({
        where: { shopId: storeId, status: 'ACTIVE' },
        select: { name: true, price: true, duration: true, description: true },
        take: 20,
      }),
      this.prisma.combo.findMany({
        where: { shopId: storeId, status: 'ACTIVE' },
        select: { name: true, price: true, description: true },
        take: 10,
      }),
      this.prisma.workingHour.findMany({
        where: { storeId },
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
      }),
    ]);

    const DAY_VI: Record<string, string> = {
      MONDAY: 'Thứ 2', TUESDAY: 'Thứ 3', WEDNESDAY: 'Thứ 4',
      THURSDAY: 'Thứ 5', FRIDAY: 'Thứ 6', SATURDAY: 'Thứ 7', SUNDAY: 'CN',
    };

    const serviceList = services
      .map((s) => `${s.name} (${s.duration} phút, ${Number(s.price).toLocaleString('vi-VN')}đ)`)
      .join(', ') || 'Chưa có thông tin';

    const comboList = combos
      .map((c) => `${c.name} (${Number(c.price).toLocaleString('vi-VN')}đ)`)
      .join(', ') || 'Chưa có combo';

    const hourList = workingHours
      .filter((h) => !h.isClosed)
      .map((h) => `${DAY_VI[h.dayOfWeek] ?? h.dayOfWeek}: ${h.openTime}-${h.closeTime}`)
      .join(', ') || 'Liên hệ để biết lịch';

    return {
      storeName: store?.name ?? 'Spa',
      services: serviceList,
      combos: comboList,
      workingHours: hourList,
    };
  }

  private buildSystemPrompt(ctx: ShopContext): string {
    return `Bạn là trợ lý AI của ${ctx.storeName}. Nhiệm vụ của bạn là tư vấn dịch vụ và hỗ trợ khách hàng đặt lịch.

Dịch vụ hiện có: ${ctx.services}.
Combo ưu đãi: ${ctx.combos}.
Giờ mở cửa: ${ctx.workingHours}.

Quy tắc bắt buộc:
1. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
2. Gợi ý dịch vụ phù hợp khi khách mô tả nhu cầu.
3. Nếu khách hỏi về vấn đề y tế/da liễu phức tạp, cần tư vấn chuyên sâu, hoặc yêu cầu gặp nhân viên thật → thêm [ESCALATE] vào CUỐI câu trả lời.
4. Không bịa đặt thông tin về giá cả hay dịch vụ không có trong danh sách.`;
  }
}
