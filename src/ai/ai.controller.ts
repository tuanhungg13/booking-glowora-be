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
    const { reply, suggestedKeywords, suggestedStoreKeywords, suggestedLocationKeywords } = await this.gemini.chatGlobal(dto.history ?? [], dto.message, context);
    const [suggestions, storeSuggestions] = await Promise.all([
      this.gemini.fetchServicesByKeywords(suggestedKeywords),
      this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, suggestedLocationKeywords),
    ]);

    const namedLocationKws = suggestedLocationKeywords.filter((k) => k !== '__near_me__');
    const hasLocation = suggestedLocationKeywords.length > 0;
    const hasService = suggestedStoreKeywords.length > 0;

    if (hasLocation && hasService && storeSuggestions.length === 0) {
      const elsewhereStores = await this.gemini.fetchStoresByKeywords(suggestedStoreKeywords, []);
      const locationLabel = namedLocationKws.length ? namedLocationKws.join(', ') : 'khu vực bạn hỏi';
      const finalReply = await this.gemini.composeNoStoreFoundReply(dto.message, suggestedStoreKeywords, locationLabel, elsewhereStores, context);
      return { reply: finalReply, suggestions, storeSuggestions: elsewhereStores };
    }

    return { reply, suggestions, storeSuggestions };
  }
}
