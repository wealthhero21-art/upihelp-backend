import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './env';
import { publicRoutes } from './routes/public';
import { adminRoutes } from './routes/admin';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    trustProxy: true, // behind Traefik
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
  });

  await app.register(publicRoutes);
  await app.register(adminRoutes);

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
