import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function lastUserText(options: LanguageModelV3CallOptions): string {
  for (let i = options.prompt.length - 1; i >= 0; i--) {
    const msg = options.prompt[i];
    if (msg.role === 'user') {
      return msg.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
    }
  }
  return '';
}

function textParts(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USAGE },
  ];
}

/**
 * Deterministic stand-in for the LLM, used by integration and e2e tests (MOCK_LLM=1).
 * It exercises the real pipeline — tool execution against DummyJSON, streaming, persistence,
 * rendering — while removing model nondeterminism and cost. Contract:
 *  - if the last prompt message is a tool result → reply with a short summary text
 *  - if the user mentions "flight" → off-catalog refusal without tools
 *  - otherwise → call searchProducts with the user's last word, singularized ("laptops" → "laptop", "watches" → "watch")
 */
export function createScriptedModel() {
  return new MockLanguageModelV3({
    provider: 'scripted',
    modelId: 'scripted-shopping-model',
    doStream: async (options) => {
      const last = options.prompt[options.prompt.length - 1];
      let chunks: LanguageModelV3StreamPart[];

      if (last?.role === 'tool') {
        chunks = textParts('Here are some options from the catalog.');
      } else {
        const text = lastUserText(options).toLowerCase();
        if (text.includes('flight')) {
          chunks = textParts("Sorry, we don't sell flights — but I can help you find travel gear like bags or sunglasses.");
        } else {
          const word = (text.match(/[a-z]+/g) ?? ['phone']).pop()!.replace(/(ch|sh|x|ss)es$/, '$1').replace(/([^s])s$/, '$1');
          chunks = [
            {
              type: 'tool-call',
              toolCallId: `call_${Date.now()}`,
              toolName: 'searchProducts',
              input: JSON.stringify({ keywords: [word] }),
            },
            { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: USAGE },
          ];
        }
      }
      return { stream: simulateReadableStream({ chunks: [{ type: 'stream-start', warnings: [] }, ...chunks] }) };
    },
  });
}
