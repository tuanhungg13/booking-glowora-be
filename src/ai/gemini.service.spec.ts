import { GeminiService } from './gemini.service';

describe('GeminiService — Phase 6 AI', () => {
  let service: GeminiService;
  let config: any;
  let prisma: any;
  let mockGenAI: any;
  let mockModel: any;
  let mockChat: any;

  const storeId = 'store-001';

  beforeEach(() => {
    mockChat = {
      sendMessage: jest.fn().mockResolvedValue({
        response: { text: jest.fn().mockReturnValue('Dịch vụ massage giá 200.000đ ạ.') },
      }),
    };

    mockModel = {
      startChat: jest.fn().mockReturnValue(mockChat),
    };

    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    };

    config = { get: jest.fn().mockReturnValue('fake-api-key') };

    prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Glowora Spa' }),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([
          { name: 'Massage Thư Giãn', price: 200000, duration: 60, description: 'Thư giãn toàn thân' },
          { name: 'Chăm sóc da mặt', price: 350000, duration: 90, description: 'Da sáng mịn' },
        ]),
      },
      combo: {
        findMany: jest.fn().mockResolvedValue([
          { name: 'Gói VIP', price: 500000, description: 'Massage + Facial' },
        ]),
      },
      workingHour: {
        findMany: jest.fn().mockResolvedValue([
          { dayOfWeek: 'MONDAY', openTime: '08:00', closeTime: '20:00', isClosed: false },
          { dayOfWeek: 'SUNDAY', openTime: '09:00', closeTime: '18:00', isClosed: true },
        ]),
      },
    };

    service = new GeminiService(config, prisma);
    // Inject mock genAI (bypasses GoogleGenerativeAI constructor)
    (service as any).genAI = mockGenAI;
  });

  afterEach(() => jest.clearAllMocks());

  // ─── chat ─────────────────────────────────────────────────────────────────

  describe('chat', () => {
    const shopCtx = {
      storeName: 'Glowora Spa',
      services: 'Massage (60 phút, 200.000đ)',
      combos: 'Gói VIP (500.000đ)',
      workingHours: 'Thứ 2: 08:00-20:00',
    };

    it('returns reply text from Gemini model', async () => {
      const result = await service.chat([], 'Giá massage bao nhiêu?', shopCtx);

      expect(result.reply).toBe('Dịch vụ massage giá 200.000đ ạ.');
      expect(result.escalate).toBe(false);
    });

    it('detects [ESCALATE] flag and sets escalate=true', async () => {
      mockChat.sendMessage.mockResolvedValue({
        response: { text: jest.fn().mockReturnValue('Vui lòng chờ nhân viên tư vấn.[ESCALATE]') },
      });

      const result = await service.chat([], 'Tôi cần tư vấn chuyên sâu', shopCtx);

      expect(result.escalate).toBe(true);
      expect(result.reply).not.toContain('[ESCALATE]');
    });

    it('removes [ESCALATE] from the reply text', async () => {
      mockChat.sendMessage.mockResolvedValue({
        response: { text: jest.fn().mockReturnValue('Để nhân viên tư vấn nhé.[ESCALATE]') },
      });

      const result = await service.chat([], 'Tôi cần gặp nhân viên', shopCtx);

      expect(result.reply).toBe('Để nhân viên tư vấn nhé.');
    });

    it('returns escalate=true and fallback reply on Gemini error', async () => {
      mockChat.sendMessage.mockRejectedValue(new Error('Network error'));

      const result = await service.chat([], 'Hi', shopCtx);

      expect(result.escalate).toBe(true);
      expect(result.reply).toBeTruthy();
      expect(result.reply.length).toBeGreaterThan(0);
    });

    it('builds system instruction using shopContext data', async () => {
      await service.chat([], 'Hi', shopCtx);

      expect(mockGenAI.getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: expect.stringContaining(shopCtx.storeName),
        }),
      );
    });

    it('maps chat history to Gemini Content format', async () => {
      const history = [
        { role: 'user' as const, content: 'Xin chào' },
        { role: 'model' as const, content: 'Chào bạn!' },
      ];

      await service.chat(history, 'Giá massage?', shopCtx);

      expect(mockModel.startChat).toHaveBeenCalledWith({
        history: [
          { role: 'user', parts: [{ text: 'Xin chào' }] },
          { role: 'model', parts: [{ text: 'Chào bạn!' }] },
        ],
      });
    });

    it('starts chat with empty history when no history provided', async () => {
      await service.chat([], 'Hi', shopCtx);

      expect(mockModel.startChat).toHaveBeenCalledWith({ history: [] });
    });
  });

  // ─── buildShopContext ─────────────────────────────────────────────────────

  describe('buildShopContext', () => {
    it('queries store, services, combos and workingHours in parallel', async () => {
      await service.buildShopContext(storeId);

      expect(prisma.store.findUnique).toHaveBeenCalledWith({
        where: { id: storeId },
        select: { name: true },
      });
      expect(prisma.service.findMany).toHaveBeenCalled();
      expect(prisma.combo.findMany).toHaveBeenCalled();
      expect(prisma.workingHour.findMany).toHaveBeenCalled();
    });

    it('returns correct storeName', async () => {
      const ctx = await service.buildShopContext(storeId);
      expect(ctx.storeName).toBe('Glowora Spa');
    });

    it('formats services with name, duration, and localized price', async () => {
      const ctx = await service.buildShopContext(storeId);

      expect(ctx.services).toContain('Massage Thư Giãn');
      expect(ctx.services).toContain('60 phút');
    });

    it('formats combos with name and localized price', async () => {
      const ctx = await service.buildShopContext(storeId);

      expect(ctx.combos).toContain('Gói VIP');
    });

    it('excludes closed days from working hours', async () => {
      const ctx = await service.buildShopContext(storeId);

      // SUNDAY is isClosed=true, should not appear in workingHours
      expect(ctx.workingHours).not.toContain('CN');
    });

    it('includes open days in working hours', async () => {
      const ctx = await service.buildShopContext(storeId);

      expect(ctx.workingHours).toContain('08:00-20:00');
    });

    it('uses "Spa" as fallback storeName when store not found', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      const ctx = await service.buildShopContext(storeId);
      expect(ctx.storeName).toBe('Spa');
    });

    it('returns default text when no services found', async () => {
      prisma.service.findMany.mockResolvedValue([]);

      const ctx = await service.buildShopContext(storeId);
      expect(ctx.services).toBe('Chưa có thông tin');
    });

    it('returns default text when no combos found', async () => {
      prisma.combo.findMany.mockResolvedValue([]);

      const ctx = await service.buildShopContext(storeId);
      expect(ctx.combos).toBe('Chưa có combo');
    });
  });
});
