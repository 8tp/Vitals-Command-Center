import type { FastifyPluginAsync } from 'fastify';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok } from '../lib/envelope.js';
import { isClaudeApiConfigured } from '../services/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Exposes what the stack has configured so the web UI can gate API-backed
 * actions (generate briefing, stream ask) behind the presence of the Anthropic
 * key — and otherwise point the user at the Claude Desktop / claude.ai MCP path.
 *
 * Also returns a ready-to-paste Claude Desktop config snippet with absolute
 * paths already resolved, so setup is copy-one-blob.
 *
 * Reveals no secrets — only booleans + file paths on the local machine.
 */
export const registerConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get('/config/status', async () => {
    const paths = resolvePaths();
    return ok({
      // AI actions (ask, daily brief) now run on the on-box CLI agent
      // (claude -p → codex fallback), so they're available regardless of the
      // Anthropic API key. Field name kept for the existing web client.
      claudeApiConfigured: true,
      anthropicApiConfigured: isClaudeApiConfigured(),
      whoopConfigured: !!process.env.WHOOP_CLIENT_ID,
      ouraConfigured: !!process.env.OURA_PAT,
      appleIngestConfigured: !!process.env.APPLE_INGEST_SECRET,
      mcp: {
        serverName: 'vitals-command-center',
        transport: 'stdio',
        paths,
        // Ready-to-paste into ~/Library/Application Support/Claude/claude_desktop_config.json
        claudeDesktopConfig: buildDesktopConfig(paths),
      },
    });
  });
};

interface McpPaths {
  repoRoot: string;
  mcpSource: string;
  mcpDist: string | null;
  dbPath: string;
  tsxBin: string | null;
  nodeBin: string;
  mode: 'dev' | 'prod';
}

function resolvePaths(): McpPaths {
  // apps/api/src/routes → walk up to repo root.
  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  const mcpSource = resolve(repoRoot, 'apps', 'mcp-server', 'src', 'index.ts');
  const mcpDistPath = resolve(repoRoot, 'apps', 'mcp-server', 'dist', 'index.js');
  const mcpDist = existsSync(mcpDistPath) ? mcpDistPath : null;
  const dbPath = resolve(process.env.DB_PATH ?? resolve(repoRoot, 'data', 'vitals.db'));
  const tsxBinPath = resolve(repoRoot, 'node_modules', '.bin', 'tsx');
  const tsxBin = existsSync(tsxBinPath) ? tsxBinPath : null;
  return {
    repoRoot,
    mcpSource,
    mcpDist,
    dbPath,
    tsxBin,
    nodeBin: process.execPath,
    mode: mcpDist ? 'prod' : 'dev',
  };
}

function buildDesktopConfig(paths: McpPaths): {
  snippet: string;
  command: string;
  args: string[];
} {
  // Prefer the built dist if it exists (stable, no tsx startup cost). Otherwise
  // fall back to tsx on source so the user doesn't have to build first.
  let command: string;
  let args: string[];
  if (paths.mcpDist) {
    command = paths.nodeBin;
    args = [paths.mcpDist];
  } else if (paths.tsxBin) {
    command = paths.tsxBin;
    args = [paths.mcpSource];
  } else {
    // Last-resort guidance: npx tsx. User will need npm install first.
    command = 'npx';
    args = ['tsx', paths.mcpSource];
  }

  const snippet = JSON.stringify(
    {
      mcpServers: {
        'vitals-command-center': {
          command,
          args,
          env: { DB_PATH: paths.dbPath },
        },
      },
    },
    null,
    2,
  );

  return { snippet, command, args };
}
