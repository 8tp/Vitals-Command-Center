#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// apps/mcp-server/src/index.ts → apps/mcp-server/src/../../.. = repo root
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDb } from '@vcc/db';
import { buildServer } from './server.js';

async function main() {
  const db = openDb({ migrate: false });
  const server = buildServer(db);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[vcc-mcp] connected via stdio\n');

  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`[vcc-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
