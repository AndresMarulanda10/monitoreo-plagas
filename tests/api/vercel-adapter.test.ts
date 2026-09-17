import { createServer, type Server } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: Server;
let baseUrl: string;
let handler: typeof import('../../api/[...path]').default;

beforeAll(async () => {
  process.env.AUTH_MODE = 'open';
  handler = (await import('../../api/[...path]')).default;
  server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a TCP address.');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.AUTH_MODE;
});

describe('Vercel Node adapter', () => {
  it('uses a parsed Vercel body and returns validation errors promptly', async () => {
    const chunks: Buffer[] = [];
    const output = new PassThrough();
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    let status: number | undefined;
    const outgoing = output as unknown as Parameters<typeof handler>[1];
    outgoing.writeHead = ((statusCode: number) => {
      status = statusCode;
      return outgoing;
    }) as Parameters<typeof handler>[1]['writeHead'];

    const incoming = {
      method: 'POST',
      url: '/api/v1/reviews/drafts',
      headers: { host: 'localhost', 'content-type': 'application/json' },
      body: {},
    } as Parameters<typeof handler>[0];

    await Promise.race([
      handler(incoming, outgoing),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Vercel adapter timed out')), 500)),
    ]);

    expect(status).toBe(422);
    expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('preserves request streaming, API paths, CORS, and response bodies', async () => {
    const session = await fetch(`${baseUrl}/api/v1/session`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:4321', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(session.status).toBe(200);
    expect(session.headers.get('access-control-allow-origin')).toBe('http://localhost:4321');
    expect(await session.json()).toMatchObject({ data: { user: { id: 'guest-observer' } } });

    const draft = await fetch(`${baseUrl}/api/v1/reviews/drafts?area=microbiology`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:4321', 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: 'microbiology', configurationId: 'lot-g-blueberry', reviewWeek: '2026-08-31', reviewDate: '2026-09-01', slot: 1 }),
    });
    expect(draft.status).toBe(201);
    expect((await draft.json()).data).toMatchObject({ area: 'microbiology', observerId: 'guest-observer' });
  });
});
