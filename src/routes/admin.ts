import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdmin } from '../auth';
import { sendExpoPush } from '../services/push';

const platformScope = z.enum(['all', 'ios', 'android']);
const platformOnly = z.enum(['ios', 'android']);

const configBody = z.object({
  platform: platformScope.default('all'),
  data: z.record(z.unknown()),
  active: z.boolean().optional(),
});

const versionBody = z.object({
  platform: platformOnly,
  minSupported: z.string().min(1).max(32),
  latest: z.string().min(1).max(32),
  storeUrl: z.string().url(),
  message: z.string().max(500).nullish(),
});

const announcementBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  level: z.enum(['info', 'warning', 'critical']).default('info'),
  platform: platformScope.default('all'),
  minVersion: z.string().max(32).nullish(),
  maxVersion: z.string().max(32).nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  active: z.boolean().default(true),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  // ----- Remote config -----
  app.get('/api/v1/admin/config', async () => {
    return { configs: await prisma.remoteConfig.findMany({ orderBy: { platform: 'asc' } }) };
  });

  app.put('/api/v1/admin/config', async (req, reply) => {
    const parsed = configBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { platform, data, active } = parsed.data;
    const row = await prisma.remoteConfig.upsert({
      where: { platform },
      create: { platform, data: data as object, active: active ?? true },
      update: { data: data as object, ...(active === undefined ? {} : { active }) },
    });
    return { config: row };
  });

  // ----- App versions / update gate -----
  app.get('/api/v1/admin/app-versions', async () => {
    return { versions: await prisma.appVersion.findMany({ orderBy: { platform: 'asc' } }) };
  });

  app.put('/api/v1/admin/app-versions', async (req, reply) => {
    const parsed = versionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { platform, minSupported, latest, storeUrl, message } = parsed.data;
    const row = await prisma.appVersion.upsert({
      where: { platform },
      create: { platform, minSupported, latest, storeUrl, message: message ?? null },
      update: { minSupported, latest, storeUrl, message: message ?? null },
    });
    return { version: row };
  });

  // ----- Announcements -----
  app.get('/api/v1/admin/announcements', async () => {
    return { announcements: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } }) };
  });

  app.post('/api/v1/admin/announcements', async (req, reply) => {
    const parsed = announcementBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const row = await prisma.announcement.create({
      data: {
        title: d.title,
        body: d.body,
        level: d.level,
        platform: d.platform,
        minVersion: d.minVersion ?? null,
        maxVersion: d.maxVersion ?? null,
        startsAt: d.startsAt ?? null,
        endsAt: d.endsAt ?? null,
        active: d.active,
      },
    });
    return reply.code(201).send({ announcement: row });
  });

  app.patch('/api/v1/admin/announcements/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = announcementBody.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    try {
      const row = await prisma.announcement.update({
        where: { id },
        data: parsed.data as Record<string, unknown>,
      });
      return { announcement: row };
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  app.delete('/api/v1/admin/announcements/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.announcement.delete({ where: { id } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  // ----- Events (read / aggregate) -----
  app.get('/api/v1/admin/events', async (req) => {
    const q = z
      .object({
        name: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).default(100),
      })
      .parse(req.query);
    const events = await prisma.event.findMany({
      where: q.name ? { name: q.name } : undefined,
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    return { events };
  });

  app.get('/api/v1/admin/events/stats', async () => {
    const grouped = await prisma.event.groupBy({
      by: ['name'],
      _count: { _all: true },
      orderBy: { _count: { name: 'desc' } },
    });
    return {
      stats: grouped.map((g) => ({ name: g.name, count: g._count._all })),
    };
  });

  // ----- Push notifications -----
  app.get('/api/v1/admin/devices', async () => {
    const total = await prisma.device.count();
    const byPlatform = await prisma.device.groupBy({ by: ['platform'], _count: { _all: true } });
    return { total, byPlatform: byPlatform.map((b) => ({ platform: b.platform, count: b._count._all })) };
  });

  app.post('/api/v1/admin/push', async (req, reply) => {
    const parsed = z
      .object({
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(500),
        platform: z.enum(['all', 'ios', 'android']).default('all'),
        data: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { title, body, platform, data } = parsed.data;
    const devices = await prisma.device.findMany({
      where: platform === 'all' ? undefined : { platform },
      select: { token: true },
    });
    const result = await sendExpoPush(
      devices.map((d) => d.token),
      { title, body, data }
    );
    return { ...result };
  });
}
