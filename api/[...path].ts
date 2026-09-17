import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createApp } from '../server/src/app.js';

const app = createApp();
type VercelIncomingMessage = IncomingMessage & { body?: unknown };

export default async function handler(incoming: VercelIncomingMessage, outgoing: ServerResponse): Promise<void> {
  const method = incoming.method ?? 'GET';
  const body = requestBody(incoming, method);
  const request = new Request(requestUrl(incoming), {
    method,
    headers: incoming.headers as HeadersInit,
    body,
    duplex: 'half',
  } as RequestInit);
  const response = await app(request);

  outgoing.writeHead(response.status, responseHeaders(response.headers));
  if (!response.body) {
    outgoing.end();
    return;
  }

  await pipeline(Readable.fromWeb(response.body as never), outgoing);
}

function requestBody(incoming: VercelIncomingMessage, method: string): BodyInit | undefined {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return undefined;
  if (!('body' in incoming)) return Readable.toWeb(incoming) as unknown as BodyInit;

  const parsedBody = incoming.body;
  if (parsedBody === undefined) return undefined;
  if (typeof parsedBody === 'string' || parsedBody instanceof ArrayBuffer || ArrayBuffer.isView(parsedBody)) {
    return parsedBody as BodyInit;
  }
  return JSON.stringify(parsedBody);
}

function requestUrl(incoming: IncomingMessage): string {
  const forwardedProto = incoming.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ?? 'https';
  const host = incoming.headers.host ?? 'localhost';
  return new URL(incoming.url ?? '/', `${protocol}://${host}`).toString();
}

function responseHeaders(headers: Headers): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  headers.forEach((value, name) => {
    result[name] = value;
  });

  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = getSetCookie?.call(headers);
  if (cookies?.length) result['set-cookie'] = cookies;

  return result;
}
