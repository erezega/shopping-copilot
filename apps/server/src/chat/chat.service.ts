import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  validateUIMessages,
  type LanguageModel,
  type Tool,
  type UIMessage,
} from 'ai';

import { MAX_HISTORY_MESSAGES, MAX_STEPS, MAX_USER_TEXT } from '../agent/agent-config';
import { buildSystemPrompt } from '../agent/system-prompt';
import { createShoppingTools, type ShoppingTools } from '../agent/tools/shopping-tools';
import { CatalogService } from '../catalog/catalog.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LANGUAGE_MODEL } from '../llm/language-model.provider';

/**
 * One chat turn: persist the user message → run the agent over the history → stream the answer
 * → persist the answer when the stream finishes. Returns a UI message stream; how it is written
 * to HTTP is the controller's job.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

  constructor(
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModel,
    private readonly catalog: CatalogService,
    private readonly conversations: ConversationsService,
  ) {}

  async respond(conversationId: string, userMessage: UIMessage) {
    const text = userMessage.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    if (!text.trim()) throw new BadRequestException('Message is empty');
    if (text.length > MAX_USER_TEXT) throw new BadRequestException(`Message is longer than ${MAX_USER_TEXT} characters`);

    const categories = await this.loadCategories();
    const tools = createShoppingTools(this.catalog, categories);

    let history: UIMessage[];
    try {
      history = await this.conversations.appendUserMessage(conversationId, userMessage);
    } catch (err) {
      // Fail before spending tokens: an answer we cannot persist would vanish on reload.
      this.logger.error(`Persistence failure for ${conversationId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not save your message. Please try again.');
    }

    const messages = await this.validateHistory([...history, userMessage], tools);

    const result = streamText({
      model: this.model,
      system: buildSystemPrompt(categories),
      messages: await convertToModelMessages(messages.slice(-MAX_HISTORY_MESSAGES), { tools, ignoreIncompleteToolCalls: true }),
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      onError: ({ error }) => this.logger.error(`LLM stream error: ${(error as Error)?.message ?? error}`),
    });

    // Keep consuming even if the browser disconnects, so onFinish still persists the answer.
    void result.consumeStream();

    return result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: this.generateMessageId,
      onFinish: async ({ responseMessage }) => {
        try {
          const saved = await this.conversations.saveAssistantMessage(conversationId, responseMessage);
          if (!saved) this.logger.log(`Conversation ${conversationId} was deleted mid-stream; answer not saved`);
        } catch (err) {
          this.logger.error(`Failed to persist assistant message in ${conversationId}: ${(err as Error).message}`);
        }
      },
      onError: (error) => {
        this.logger.error(`Chat failed: ${(error as Error)?.message ?? error}`);
        return 'Sorry, something went wrong while generating the answer. Please try again.';
      },
    });
  }

  /** Degrades instead of failing: without categories the tool schema accepts any category string. */
  private async loadCategories(): Promise<string[]> {
    try {
      return await this.catalog.getCategories();
    } catch (err) {
      this.logger.warn(`Could not load categories: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Stored history is validated against the current tool schemas. If it no longer validates
   * (corrupted row, schema changed between versions) we keep the conversation going with just
   * the new message instead of failing the request.
   */
  private async validateHistory(messages: UIMessage[], tools: ShoppingTools): Promise<UIMessage[]> {
    try {
      // Cast: validateUIMessages types tools as Tool<unknown, unknown>, which concrete tool types do not satisfy (variance).
      return await validateUIMessages({ messages, tools: tools as unknown as Record<string, Tool<unknown, unknown>> });
    } catch (err) {
      this.logger.warn(`History failed validation, continuing without it: ${(err as Error).message}`);
      return messages.slice(-1);
    }
  }
}
