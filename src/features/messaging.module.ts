import { Module, forwardRef } from '@nestjs/common';
import { ConversationsModule } from './messaging/conversations/conversations.module';
import { MessagesModule } from './messaging/messages/messages.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ConversationsModule, MessagesModule, forwardRef(() => TelegramModule)],
  exports: [ConversationsModule, MessagesModule],
})
export class MessagingModule {}
