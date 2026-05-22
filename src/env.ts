import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('production'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Required: protects all /api/v1/admin/* endpoints.
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  // Optional: if set, POST /events requires this in the x-app-key header.
  APP_INGEST_KEY: z.string().optional().default(''),
  // Optional: server-side Facebook Conversions API. Dormant until both are set.
  FB_APP_ID: z.string().optional().default(''),
  FB_CAPI_ACCESS_TOKEN: z.string().optional().default(''),
  FB_TEST_EVENT_CODE: z.string().optional().default(''),
  CORS_ORIGIN: z.string().optional().default('*'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment configuration:',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)
  );
  process.exit(1);
}

export const env = parsed.data;
export const fbEnabled = Boolean(env.FB_APP_ID && env.FB_CAPI_ACCESS_TOKEN);
