/**
 * LLM evaluation: runs the REAL model (gpt-6-luna) with the real system prompt, tools and
 * DummyJSON catalog, and checks the agent's DECISIONS — did it search, with which filters, did
 * it refuse off-catalog requests — rather than exact wording (which is nondeterministic).
 *
 *   pnpm eval            # all cases, 1 run each
 *   EVAL_RUNS=3 pnpm eval  # repeat each case to see flakiness
 *
 * Exits 1 if the pass rate is below EVAL_THRESHOLD (default 0.8).
 */
import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, type ModelMessage } from 'ai';
import type { SearchProductsInput, SearchProductsOutput } from '@shopping-copilot/shared';

import { CatalogService } from '../src/catalog/catalog.service';
import { MAX_STEPS } from '../src/agent/agent-config';
import { createShoppingTools } from '../src/agent/tools/shopping-tools';
import { buildSystemPrompt } from '../src/agent/system-prompt';

interface Turn {
  text: string;
  searches: { input: SearchProductsInput; output: SearchProductsOutput }[];
  toolNames: string[];
}

interface EvalCase {
  name: string;
  /** One or more user messages, sent in sequence in the same conversation. */
  messages: string[];
  /** Returns a list of failure reasons for the LAST turn (empty = pass). */
  check: (turn: Turn) => string[];
}

const words = (s: SearchProductsInput) => [...(s.keywords ?? []), s.category ?? ''].join(' ').toLowerCase();
/** 0/null mean "no limit" (see normalizeSearchInput), so they don't count as a price constraint. */
const maxOf = (s: SearchProductsInput) => (s.maxPrice && s.maxPrice > 0 ? s.maxPrice : undefined);
const anySearch = (t: Turn, pred: (s: SearchProductsInput) => boolean) => t.searches.some((s) => pred(s.input));

const CASES: EvalCase[] = [
  {
    name: 'price constraint is applied',
    messages: ['cheap phones under $300'],
    check: (t) => [
      ...(t.searches.length ? [] : ['no search']),
      ...(anySearch(t, (s) => (maxOf(s) ?? Infinity) <= 300) ? [] : ['maxPrice<=300 not set']),
      ...(t.searches.flatMap((s) => s.output.products).every((p) => p.price <= 300) ? [] : ['returned product over $300']),
      ...(t.searches.flatMap((s) => s.output.products).length ? [] : ['no products returned']),
    ],
  },
  {
    name: 'ambiguous: searches and asks one question',
    messages: ['something cheap and cool'],
    check: (t) => [
      ...(t.searches.length ? [] : ['did not search (should pick an interpretation)']),
      ...(anySearch(t, (s) => s.sortBy === 'price_asc' || maxOf(s) !== undefined) ? [] : ['"cheap" not mapped to price']),
      ...(t.text.includes('?') ? [] : ['no clarifying question']),
    ],
  },
  {
    name: 'off-catalog: no tool call, declines',
    messages: ['Book me a flight to Tokyo next week'],
    check: (t) => [
      ...(t.toolNames.length === 0 ? [] : [`called tools: ${t.toolNames.join(',')}`]),
      ...(/(can['’]t|cannot|doesn['’]t|don['’]t|does not|do not|unable|not able|only)/i.test(t.text) ? [] : ['did not decline']),
    ],
  },
  {
    name: 'off-topic question: no tool call',
    messages: ["What's the weather in Paris?"],
    check: (t) => (t.toolNames.length === 0 ? [] : [`called tools: ${t.toolNames.join(',')}`]),
  },
  {
    name: 'multi-intent: one search per need',
    messages: ['I need a laptop and a lipstick'],
    check: (t) => [
      ...(t.searches.length >= 2 ? [] : [`only ${t.searches.length} search(es)`]),
      ...(anySearch(t, (s) => /laptop/.test(words(s))) ? [] : ['no laptop search']),
      ...(anySearch(t, (s) => /lipstick|beauty|lip/.test(words(s))) ? [] : ['no lipstick search']),
    ],
  },
  {
    name: 'category + sort mapping',
    messages: ['show me the best rated men shoes'],
    check: (t) => [
      ...(anySearch(t, (s) => s.category === 'mens-shoes') ? [] : ['category mens-shoes not used']),
      ...(anySearch(t, (s) => s.sortBy === 'rating') ? [] : ['sortBy rating not used']),
    ],
  },
  {
    name: 'multi-word need is broken into keywords that hit',
    messages: ['do you have any gaming laptops?'],
    check: (t) => (t.searches.flatMap((s) => s.output.products).length ? [] : ['zero products returned']),
  },
  {
    name: 'non-English request',
    messages: ['אני מחפשת שעון לאישה'],
    check: (t) => [
      ...(anySearch(t, (s) => s.category === 'womens-watches' || /watch/.test(words(s))) ? [] : ['no watch search']),
      ...(/[֐-׿]/.test(t.text) ? [] : ['did not answer in Hebrew']),
    ],
  },
  {
    name: 'follow-up "cheaper" uses context',
    messages: ['show me some laptops', 'any cheaper ones?'],
    check: (t) => [
      ...(anySearch(t, (s) => /laptop/.test(words(s))) ? [] : ['lost laptop context']),
      ...(anySearch(t, (s) => s.sortBy === 'price_asc' || maxOf(s) !== undefined) ? [] : ['no price constraint on follow-up']),
    ],
  },
];

async function runCase(c: EvalCase, deps: { model: ReturnType<ReturnType<typeof createOpenAI>>; system: string; tools: ReturnType<typeof createShoppingTools> }): Promise<{ turn: Turn; failures: string[] }> {
  const history: ModelMessage[] = [];
  let turn: Turn = { text: '', searches: [], toolNames: [] };
  for (const userText of c.messages) {
    history.push({ role: 'user', content: userText });
    const result = await generateText({
      model: deps.model,
      system: deps.system,
      messages: history,
      tools: deps.tools,
      stopWhen: stepCountIs(MAX_STEPS),
    });
    history.push(...result.response.messages);
    const calls = result.steps.flatMap((s) => s.toolCalls);
    const results = result.steps.flatMap((s) => s.toolResults);
    turn = {
      text: result.text,
      toolNames: calls.map((tc) => tc.toolName),
      searches: results
        .filter((r) => r.toolName === 'searchProducts')
        .map((r) => ({ input: r.input as SearchProductsInput, output: r.output as SearchProductsOutput })),
    };
  }
  return { turn, failures: c.check(turn) };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing (apps/server/.env)');
  const runs = Number(process.env.EVAL_RUNS ?? 1);
  const threshold = Number(process.env.EVAL_THRESHOLD ?? 0.8);
  const only = process.argv[2];

  const catalog = new CatalogService();
  const categories = await catalog.getCategories();
  const deps = {
    model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(process.env.OPENAI_MODEL ?? 'gpt-6-luna'),
    system: buildSystemPrompt(categories),
    tools: createShoppingTools(catalog, categories),
  };

  const cases = CASES.filter((c) => !only || c.name.includes(only));
  let passed = 0;
  let total = 0;
  for (const c of cases) {
    const outcomes = await Promise.all(Array.from({ length: runs }, () => runCase(c, deps).catch((e: Error) => ({ turn: null, failures: [`error: ${e.message}`] }))));
    for (const o of outcomes) {
      total++;
      if (o.failures.length === 0) passed++;
      const status = o.failures.length === 0 ? 'PASS' : 'FAIL';
      console.log(`${status}  ${c.name}${o.failures.length ? `  — ${o.failures.join('; ')}` : ''}`);
      if (o.turn && (o.failures.length || process.env.EVAL_VERBOSE)) {
        console.log(`        searches: ${JSON.stringify(o.turn.searches.map((s) => s.input))}`);
        console.log(`        reply: ${o.turn.text.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
    }
  }
  const rate = total ? passed / total : 0;
  console.log(`\n${passed}/${total} passed (${Math.round(rate * 100)}%), threshold ${Math.round(threshold * 100)}%`);
  process.exit(rate >= threshold ? 0 : 1);
}

void main();
