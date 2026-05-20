import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule {}
