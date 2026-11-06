import { Module } from '@nestjs/common';

import { ChatModule } from './chat/chat.module';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConversationsModule, ChatModule],
})
export class AppModule {}
