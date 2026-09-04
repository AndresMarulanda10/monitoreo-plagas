import { createClient } from '@supabase/supabase-js';

export type AuthUser = { id: string; email?: string };

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  const part = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}

export function cookieHeader(name: string, value: string, secure = false): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=28800${secure ? '; Secure' : ''}`;
}

export type AuthResolver = (request: Request) => Promise<AuthUser | null>;

export function createSupabaseAuthResolver(url: string, anonKey: string): AuthResolver {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return async (request) => {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : readCookie(request, 'mp_session');
    if (!token) return null;
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? undefined };
  };
}

export async function signInSupabase(url: string, anonKey: string, email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return null;
  return { token: data.session.access_token, user: { id: data.user.id, email: data.user.email ?? undefined } };
}
