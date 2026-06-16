import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GeminiService } from './gemini.service';
import { PlatformChatDto } from './dto/platform-chat.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly gemini: GeminiService) {}

  @ApiOperation({ summary: 'Chat với AI tư vấn toàn nền tảng Glowora' })
  @Public()
  @Post('chat')
  async chat(@Body() dto: PlatformChatDto) {
    const context = await this.gemini.buildPlatformContext();
    const { reply, suggestedKeywords, suggestedStoreKeywords } = await this.gemini.chatGlobal(dto.history ?? [], dto.message, context);
    const [suggestions, storeSuggestions] = await Promise.all([
      this.gemini.fetchServicesByKeywords(suggestedKeywords),
      this.gemini.fetchStoresByKeywords(suggestedStoreKeywords),
    ]);
    return { reply, suggestions, storeSuggestions };
  }
}
