import { Module } from '@nestjs/common';
import { ConversationsModule } from './messaging/conversations/conversations.module';
import { MessagesModule } from './messaging/messages/messages.module';

/**
 * Feature: Messaging
 * - Conversations (hội thoại)
 * - Messages (tin nhắn)
 */
@Module({
  imports: [ConversationsModule, MessagesModule],
  exports: [ConversationsModule, MessagesModule],
})
export class MessagingModule {}
