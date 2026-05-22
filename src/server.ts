import { buildApp } from './app';
import { env } from './env';
import { prisma } from './db';
import { ensureDefaults } from './services/data';

async function main() {
  const app = await buildApp();

  try {
    await ensureDefaults();
  } catch (err) {
    app.log.error({ err }, 'ensureDefaults failed (continuing)');
  }

  await app.listen({ host: env.HOST, port: env.PORT });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
