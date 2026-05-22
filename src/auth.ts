import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from './env';

// Guard for /api/v1/admin/* — requires the x-admin-key header.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const key = req.headers['x-admin-key'];
  if (typeof key !== 'string' || key !== env.ADMIN_API_KEY) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

// Guard for POST /events — only enforced if APP_INGEST_KEY is configured.
export async function requireIngestKey(req: FastifyRequest, reply: FastifyReply) {
  if (!env.APP_INGEST_KEY) return; // open ingest when no key is set
  const key = req.headers['x-app-key'];
  if (typeof key !== 'string' || key !== env.APP_INGEST_KEY) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}
