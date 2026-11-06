/**
 * Integration test of the whole server pipeline:
 *   HTTP request → ChatController → (scripted) model → searchProducts tool → CatalogService
 *   → UI message stream (SSE) → SQLite persistence → GET /api/conversations.
 * Only the two external systems are faked: the LLM (scripted model) and DummyJSON (fetch mock).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

const dir = mkdtempSync(join(tmpdir(), 'copilot-test-'));
const dbUrl = `file:${join(dir, 'test.db')}`;
process.env.DATABASE_URL = dbUrl;

import { AppModule } from '../src/app.module';
import { LANGUAGE_MODEL } from '../src/llm/language-model.provider';
import { createScriptedModel } from '../src/llm/scripted-model';
import { ConversationsService } from '../src/conversations/conversations.service';
import { PrismaService } from '../src/prisma/prisma.service';

const LAPTOPS = [
  { id: 78, title: 'Apple MacBook Pro 14 Inch', description: 'A laptop', category: 'laptops', price: 1999.99, rating: 4.6, thumbnail: 'https://img/78.png' },
  { id: 80, title: 'Huawei Matebook X Pro', description: 'A slim laptop', category: 'laptops', price: 1399.99, rating: 4.9, thumbnail: 'https://img/80.png' },
];

let catalogDown = false;
function installFakeDummyJson() {
  global.fetch = jest.fn(async (url: string) => {
    if (catalogDown) throw new Error('ECONNREFUSED');
    const path = url.replace('https://dummyjson.com', '');
    if (path === '/products/category-list') return new Response(JSON.stringify(['laptops', 'smartphones']));
    if (path.startsWith('/products/search?q=laptop')) return new Response(JSON.stringify({ products: LAPTOPS, total: 2 }));
    if (path.startsWith('/products/search')) return new Response(JSON.stringify({ products: [], total: 0 }));
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

type Chunk = { type: string; [k: string]: unknown };
/** The `tool-output-available` chunk's output, typed for assertions. */
function toolOutput<T>(chunks: Chunk[]): T {
  const chunk = chunks.find((c) => c.type === 'tool-output-available');
  if (!chunk) throw new Error('no tool-output-available chunk in stream');
  return chunk.output as T;
}

function parseSse(body: string): Chunk[] {
  return body
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice(6)) as Chunk);
}

describe('Chat pipeline (integration)', () => {
  let app: INestApplication;
  let model: ReturnType<typeof createScriptedModel>;
  let prisma: PrismaService;

  beforeAll(async () => {
    execSync(`npx prisma db push --url "${dbUrl}"`, { stdio: 'ignore' });
    installFakeDummyJson();
    model = createScriptedModel();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LANGUAGE_MODEL)
      .useValue(model)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    catalogDown = false;
  });

  const send = (id: string, text: string, messageId = `u-${Math.random()}`) =>
    request(app.getHttpServer())
      .post('/api/chat')
      .send({ id, message: { id: messageId, role: 'user', parts: [{ type: 'text', text }] } })
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => cb(null, data));
      });

  it('user input → tool call → products streamed → answer text', async () => {
    const res = await send('c1', 'show me laptops');
    expect(res.status).toBe(200);
    const chunks = parseSse(res.body as string);

    const call = chunks.find((c) => c.type === 'tool-input-available');
    expect(call).toMatchObject({ toolName: 'searchProducts', input: { keywords: ['laptop'] } });

    const output = toolOutput<{ products: { id: number }[] }>(chunks);
    expect(output.products.map((p) => p.id)).toEqual(expect.arrayContaining([78, 80]));

    const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');
    expect(text).toContain('Here are some options');
  });

  it('persists the conversation exactly as rendered (incl. tool output) and lists it', async () => {
    const list = await request(app.getHttpServer()).get('/api/conversations');
    expect(list.body).toEqual([expect.objectContaining({ id: 'c1', title: 'show me laptops' })]);

    const convo = await request(app.getHttpServer()).get('/api/conversations/c1');
    const [user, assistant] = convo.body.messages;
    expect(user.role).toBe('user');
    expect(assistant.role).toBe('assistant');
    const toolPart = assistant.parts.find((p: { type: string }) => p.type === 'tool-searchProducts');
    expect(toolPart.state).toBe('output-available');
    expect(toolPart.output.products).toHaveLength(2);
  });

  it('continues a conversation: history from the DB is sent to the model', async () => {
    const callsBefore = model.doStreamCalls.length;
    await send('c1', 'and phones');
    const firstCallOfTurn = model.doStreamCalls[callsBefore];
    const userTexts = firstCallOfTurn.prompt
      .filter((m) => m.role === 'user')
      .map((m) => (m.content as { type: string; text?: string }[]).map((p) => p.text).join(''));
    expect(userTexts).toEqual(['show me laptops', 'and phones']);

    const convo = await request(app.getHttpServer()).get('/api/conversations/c1');
    expect(convo.body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('off-catalog request: no tool call', async () => {
    const chunks = parseSse((await send('c2', 'book me a flight to Tokyo')).body as string);
    expect(chunks.some((c) => c.type.startsWith('tool-'))).toBe(false);
    expect(chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('')).toMatch(/don't sell flights/);
  });

  it('catalog outage: tool returns an error payload and the chat still completes', async () => {
    catalogDown = true;
    // "tablets" was never fetched, so the 10-min response cache can't mask the outage.
    const chunks = parseSse((await send('c3', 'show me tablets')).body as string);
    const output = toolOutput<{ error?: string }>(chunks);
    expect(output.error).toMatch(/unavailable/);
    expect(chunks.some((c) => c.type === 'finish')).toBe(true);
  });

  it('a corrupted stored message is skipped instead of breaking the conversation', async () => {
    await prisma.message.create({ data: { id: 'bad', conversationId: 'c1', role: 'assistant', parts: '{not json', seq: 999 } });
    const convo = await request(app.getHttpServer()).get('/api/conversations/c1');
    expect(convo.status).toBe(200);
    expect(convo.body.messages).toHaveLength(4);
    expect((await send('c1', 'more laptops')).status).toBe(200);
  });

  it('rejects malformed and empty requests', async () => {
    await request(app.getHttpServer()).post('/api/chat').send({ nope: true }).expect(400);
    await request(app.getHttpServer())
      .post('/api/chat')
      .send({ id: 'c9', message: { id: 'm', role: 'user', parts: [{ type: 'text', text: '   ' }] } })
      .expect(400);
  });

  it('message save fails → 503, model not called, and no empty conversation left behind', async () => {
    // Fail the message write AFTER the conversation row was upserted in the same transaction:
    // the transaction must roll the conversation back too, or the sidebar shows an empty chat.
    const conversations = app.get(ConversationsService);
    const spy = jest
      .spyOn(conversations as unknown as { upsertMessage: () => Promise<void> }, 'upsertMessage')
      .mockRejectedValueOnce(new Error('SQLITE_FULL'));
    const callsBefore = model.doStreamCalls.length;

    const res = await send('c4', 'show me laptops');

    expect(res.status).toBe(503);
    expect(model.doStreamCalls.length).toBe(callsBefore);
    await request(app.getHttpServer()).get('/api/conversations/c4').expect(404);
    const list = await request(app.getHttpServer()).get('/api/conversations');
    expect(list.body.map((c: { id: string }) => c.id)).not.toContain('c4');
    spy.mockRestore();
  });

  it('unknown conversation → 404; delete removes it', async () => {
    await request(app.getHttpServer()).get('/api/conversations/does-not-exist').expect(404);
    await request(app.getHttpServer()).delete('/api/conversations/c2').expect(204);
    await request(app.getHttpServer()).get('/api/conversations/c2').expect(404);
  });
});
