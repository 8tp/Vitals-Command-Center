import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
// Resolve .env against the monorepo root, not the workspace cwd — otherwise
// `npm run dev --workspace apps/api` would look in apps/api/.env and miss the
// real one.
// apps/api/src/index.ts → apps/api/src/../../.. = repo root
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { openDb } from '@vcc/db';

import { registerHealthRoutes } from './routes/health.js';
import { registerDailyRoutes } from './routes/daily.js';
import { registerSleepRoutes } from './routes/sleep.js';
import { registerWorkoutRoutes } from './routes/workouts.js';
import { registerVitalsRoutes } from './routes/vitals.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerCompareRoutes } from './routes/compare.js';
import { registerHabitRoutes } from './routes/habits.js';
import { registerInsightsRoutes } from './routes/insights.js';
import { registerAskRoutes } from './routes/ask.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { startSchedulers } from './jobs/scheduler.js';

const PORT = Number(process.env.API_PORT ?? 3001);
const HOST = process.env.API_HOST ?? '0.0.0.0';

async function main() {
  // Boot DB + run migrations so downstream routes can rely on schema.
  const db = openDb();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS: explicit allowlist (never reflect arbitrary origins). Driven by
  // CORS_ORIGINS (comma-separated); defaults to the Vite dev server + the API's
  // own origin. Requests with no Origin header (curl, same-origin, server-to-
  // server) are allowed.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  });
  await app.register(sensible);

  // Decorate so every route gets `req.server.db`.
  app.decorate('db', db);

  // Routes
  await app.register(registerHealthRoutes, { prefix: '/api' });
  await app.register(registerDailyRoutes, { prefix: '/api' });
  await app.register(registerSleepRoutes, { prefix: '/api' });
  await app.register(registerWorkoutRoutes, { prefix: '/api' });
  await app.register(registerVitalsRoutes, { prefix: '/api' });
  await app.register(registerDeviceRoutes, { prefix: '/api' });
  await app.register(registerCompareRoutes, { prefix: '/api' });
  await app.register(registerHabitRoutes, { prefix: '/api' });
  await app.register(registerInsightsRoutes, { prefix: '/api' });
  await app.register(registerAskRoutes, { prefix: '/api' });
  await app.register(registerConversationRoutes, { prefix: '/api' });
  await app.register(registerSyncRoutes, { prefix: '/api' });
  await app.register(registerIngestRoutes, { prefix: '/api' });
  await app.register(registerAuthRoutes, { prefix: '/api' });
  await app.register(registerConfigRoutes, { prefix: '/api' });
  await app.register(registerSettingsRoutes, { prefix: '/api' });

  // Serve the built web dashboard (production). Absent in dev (Vite serves it),
  // so this no-ops cleanly until `apps/web` is built. SPA: unknown GET → index.html.
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps/web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
      return reply.status(404).send({ ok: false, error: { error: 'not found', code: 'NOT_FOUND' } });
    });
    app.log.info(`serving web dashboard from ${webDist}`);
  }

  // Error shape
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    app.log.error({ err }, 'request failed');
    if (err.validation) {
      return reply.status(400).send({ ok: false, error: { error: err.message, code: 'VALIDATION', details: err.validation } });
    }
    const status = err.statusCode ?? 500;
    return reply
      .status(status)
      .send({ ok: false, error: { error: err.message, code: err.code ?? 'INTERNAL' } });
  });

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`Vitals Command Center API listening on http://${HOST}:${PORT}`);

  if (process.env.DISABLE_SCHEDULERS !== '1') {
    startSchedulers(app.log.child({ module: 'scheduler' }));
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof openDb>;
  }
}
