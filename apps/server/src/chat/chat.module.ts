import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * Chatting: ChatController (HTTP) → ChatService (one turn). It wires together the model (LlmModule), the agent's tools
 * (which need CatalogModule) and persistence (ConversationsModule). The agent definition itself
 * lives in src/agent/ as plain functions, so the eval can use it without Nest or HTTP.
 */
@Module({
  imports: [LlmModule, CatalogModule, ConversationsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
