import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  it('should be defined', () => {
    const config = { get: jest.fn().mockReturnValue('fake-api-key') };
    const prisma = {} as any;
    const service = new GeminiService(config as any, prisma);
    expect(service).toBeDefined();
  });
});
