import { Controller, Delete, Get, HttpCode, Param } from '@nestjs/common';

import { ConversationsService } from './conversations.service';

@Controller('api/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list() {
    return this.conversations.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.conversations.getOrThrow(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    await this.conversations.delete(id);
  }
}
