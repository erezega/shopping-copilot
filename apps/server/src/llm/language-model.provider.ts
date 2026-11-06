import type { Provider } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { createScriptedModel } from './scripted-model';

export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

/**
 * The model is injected (not imported) so tests and the e2e suite can swap in a deterministic
 * scripted model with MOCK_LLM=1, while production uses OpenAI.
 */
export const languageModelProvider: Provider = {
  provide: LANGUAGE_MODEL,
  useFactory: (): LanguageModel => {
    if (process.env.MOCK_LLM === '1') return createScriptedModel();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is missing. Copy apps/server/.env.example to apps/server/.env and set it.');
    }
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(process.env.OPENAI_MODEL ?? 'gpt-6-luna');
  },
};
