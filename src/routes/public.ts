import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { requireIngestKey } from '../auth';
import { getAnnouncements, getConfig, getVersionStatus } from '../services/data';
import { forwardEvent } from '../services/fbCapi';

const launchQuery = z.object({
  platform: z.enum(['ios', 'android', 'all']).optional(),
  version: z.string().max(32).optional(),
});

const eventBody = z.object({
  name: z.string().min(1).max(128),
  platform: z.enum(['ios', 'android']).optional(),
  appVersion: z.string().max(32).optional(),
  deviceId: z.string().max(128).optional(),
  params: z.record(z.unknown()).optional(),
});

export async function publicRoutes(app: FastifyInstance) {
  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', time: new Date().toISOString() };
    } catch {
      return reply.code(503).send({ status: 'degraded', db: 'unreachable' });
    }
  });

  // One call at app launch: config + version gate + announcements.
  app.get('/api/v1/bootstrap', async (req) => {
    const q = launchQuery.parse(req.query);
    const [config, update, announcements] = await Promise.all([
      getConfig(q.platform),
      getVersionStatus(q.platform, q.version),
      getAnnouncements(q.platform, q.version),
    ]);
    return { config, update, announcements };
  });

  app.get('/api/v1/config', async (req) => {
    const q = launchQuery.parse(req.query);
    return { config: await getConfig(q.platform) };
  });

  app.get('/api/v1/version-check', async (req) => {
    const q = launchQuery.parse(req.query);
    return await getVersionStatus(q.platform, q.version);
  });

  app.get('/api/v1/announcements', async (req) => {
    const q = launchQuery.parse(req.query);
    return { announcements: await getAnnouncements(q.platform, q.version) };
  });

  // Event ingest: store, then forward to FB CAPI in the background.
  app.post('/api/v1/events', { preHandler: requireIngestKey }, async (req, reply) => {
    const parsed = eventBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const event = await prisma.event.create({
      data: {
        name: body.name,
        platform: body.platform ?? null,
        appVersion: body.appVersion ?? null,
        deviceId: body.deviceId ?? null,
        params: (body.params ?? undefined) as object | undefined,
      },
    });

    // Fire-and-forget; mark forwarded on success.
    void forwardEvent({
      name: body.name,
      platform: body.platform,
      deviceId: body.deviceId,
      params: body.params ?? null,
    }).then((ok) => {
      if (ok) {
        prisma.event
          .update({ where: { id: event.id }, data: { fbForwarded: true } })
          .catch(() => undefined);
      }
    });

    return reply.code(202).send({ id: event.id, accepted: true });
  });
}
