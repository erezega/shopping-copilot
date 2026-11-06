import { Module } from '@nestjs/common';

import { LANGUAGE_MODEL, languageModelProvider } from './language-model.provider';

/** Decides WHICH model runs the agent (OpenAI, or the scripted model when MOCK_LLM=1). */
@Module({
  providers: [languageModelProvider],
  exports: [LANGUAGE_MODEL],
})
export class LlmModule {}
