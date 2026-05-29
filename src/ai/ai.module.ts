import { Module } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [GeminiService],
  exports: [GeminiService],
})
export class AiModule {}
