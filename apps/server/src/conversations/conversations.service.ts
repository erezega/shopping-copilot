import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UIMessage } from 'ai';
import type { ConversationListItem } from '@shopping-copilot/shared';

import type { Message, Prisma } from '../prisma/generated/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Conversation persistence. The server (SQLite) is the source of truth; the browser only keeps
 * the active conversation id in the URL. Messages are stored as AI SDK UIMessages (parts JSON),
 * i.e. exactly what the UI renders — including tool outputs — so a reload re-renders the same
 * product cards without re-querying the catalog.
 *
 * Services use PrismaService directly (no repository layer): Prisma already is the typed data
 * access layer, and a wrapper over two tables would only pass calls through.
 */
@Injectable()
export class ConversationsService {
  private static readonly TITLE_MAX = 60;
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a chat turn: creates the conversation on its first message (so "New chat" clicks never
   * leave empty rows), saves the user message, and returns the history BEFORE it.
   * One transaction: if saving the message fails, no conversation row is left behind either —
   * otherwise the sidebar would show a titled chat with no messages.
   */
  async appendUserMessage(conversationId: string, message: UIMessage): Promise<UIMessage[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.conversation.upsert({
        where: { id: conversationId },
        create: { id: conversationId, title: this.titleFromMessage(message) },
        update: {},
      });
      const rows = await tx.message.findMany({ where: { conversationId }, orderBy: { seq: 'asc' } });
      await this.upsertMessage(tx, conversationId, message);
      return this.parseRows(conversationId, rows.filter((r) => r.id !== message.id));
    });
  }

  /**
   * Saves the model's answer once streaming finishes. Returns false (and saves nothing) if the user
   * deleted the conversation while the answer was streaming — checked inside the same transaction,
   * so a delete can't slip in between the check and the insert.
   */
  async saveAssistantMessage(conversationId: string, message: UIMessage): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.conversation.count({ where: { id: conversationId } })) === 0) return false;
      await this.upsertMessage(tx, conversationId, message);
      return true;
    });
  }

  async list(): Promise<ConversationListItem[]> {
    const rows = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
    });
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }

  async getOrThrow(id: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException(`Conversation ${id} not found`);
    return { id: conversation.id, title: conversation.title, messages: await this.getMessages(id) };
  }

  async getMessages(id: string): Promise<UIMessage[]> {
    const rows = await this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' } });
    return this.parseRows(id, rows);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.conversation.deleteMany({ where: { id } });
  }

  /** Upsert by message id, so saving the same message twice (retries) is idempotent. */
  private async upsertMessage(tx: Prisma.TransactionClient, conversationId: string, message: UIMessage): Promise<void> {
    const parts = JSON.stringify(message.parts);
    const existing = await tx.message.findUnique({ where: { id: message.id } });
    if (existing) {
      await tx.message.update({ where: { id: message.id }, data: { parts } });
    } else {
      const last = await tx.message.findFirst({ where: { conversationId }, orderBy: { seq: 'desc' } });
      await tx.message.create({
        data: { id: message.id, conversationId, role: message.role, parts, seq: (last?.seq ?? -1) + 1 },
      });
    }
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }

  private parseRows(conversationId: string, rows: Message[]): UIMessage[] {
    const messages: UIMessage[] = [];
    for (const row of rows) {
      try {
        messages.push({ id: row.id, role: row.role as UIMessage['role'], parts: JSON.parse(row.parts) });
      } catch {
        // A corrupted row must not make the whole conversation unreadable — skip it and log.
        this.logger.error(`Skipping corrupted message ${row.id} in conversation ${conversationId}`);
      }
    }
    return messages;
  }

  /** Sidebar title from the first user message: one line, cut to TITLE_MAX with "…". */
  private titleFromMessage(message: UIMessage): string {
    const max = ConversationsService.TITLE_MAX;
    const text = message.parts
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return 'New conversation';
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }
}
