import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const SECRET = env.ADMIN_SESSION_SECRET || env.ADMIN_API_KEY;

function sign(data: string): string {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

// Stateless HMAC session token: base64url(payload).signature
export function issueSession(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: email, exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySession(token: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return false;
  }
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

// Validates admin-panel login credentials.
export function checkCredentials(email: string, password: string): boolean {
  const allowed = env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase());
  return allowed.includes((email || '').trim().toLowerCase()) && password === env.ADMIN_PASSWORD;
}

// Guard for /api/v1/admin/* — accepts a Bearer session token (admin panel)
// OR the x-admin-key header (scripts / server-to-server).
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const key = req.headers['x-admin-key'];
  if (typeof key === 'string' && key === env.ADMIN_API_KEY) return;

  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    if (verifySession(auth.slice(7))) return;
  }
  return reply.code(401).send({ error: 'unauthorized' });
}

// Guard for POST /events — only enforced if APP_INGEST_KEY is configured.
export async function requireIngestKey(req: FastifyRequest, reply: FastifyReply) {
  if (!env.APP_INGEST_KEY) return; // open ingest when no key is set
  const key = req.headers['x-app-key'];
  if (typeof key !== 'string' || key !== env.APP_INGEST_KEY) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}
