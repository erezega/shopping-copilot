import { BadRequestException, Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { pipeUIMessageStreamToResponse, type UIMessage } from 'ai';
import { z } from 'zod';

import { ChatService } from './chat.service';

const ChatRequestSchema = z.object({
  id: z.string().min(1).max(100),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal('user'),
    parts: z.array(z.any()).min(1),
  }),
});

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /**
   * The client sends only the new user message + conversation id; history is loaded from the DB.
   * That keeps the server the single source of truth and stops a client from rewriting history.
   */
  @Post()
  async create(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid chat request');

    const stream = await this.chat.respond(parsed.data.id, parsed.data.message as UIMessage);
    pipeUIMessageStreamToResponse({ response: res, stream });
  }
}
