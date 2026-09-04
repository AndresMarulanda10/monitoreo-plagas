import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createApp } from './app';

const port = Number(process.env.API_PORT ?? 8787);
const app = createApp();

createServer(async (incoming, outgoing) => {
  const origin = `http://${incoming.headers.host ?? 'localhost'}`;
  const body = incoming.method === 'GET' || incoming.method === 'HEAD' || incoming.method === 'OPTIONS' ? undefined : Readable.toWeb(incoming) as unknown as BodyInit;
  const request = new Request(`${origin}${incoming.url ?? '/'}`, { method: incoming.method, headers: incoming.headers as HeadersInit, body, duplex: 'half' } as RequestInit);
  const response = await app(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) Readable.fromWeb(response.body as never).pipe(outgoing);
  else outgoing.end();
}).listen(port, () => console.log(`Monitoring API listening on http://localhost:${port}`));
