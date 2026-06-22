import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Database } from 'better-sqlite3';
import { getUserProfile } from '@vcc/shared';
import { TOOL_DEFINITIONS, WRITE_TOOLS, runTool } from './tools/index.js';

/**
 * Server-level instructions. Claude Desktop and claude.ai surface this as the
 * system prompt for the session, so the analyst persona + device hierarchy +
 * alert thresholds + tone rules are live without the user pasting anything.
 *
 * Canonical copy in SPEC.md; the direct-API variant lives in
 * apps/api/src/services/claude.ts (HEALTH_SYSTEM_PROMPT). Edit together.
 */
export const INSTRUCTIONS = `You are the user's personal health intelligence analyst. Their data comes from one or more connected wearables (e.g. Fitbit / Pixel via Google Health, Apple Watch, Oura, WHOOP), unified here and exposed through the tools below.

## Your role
- Analyze the data and deliver actionable, specific recommendations
- Detect patterns, anomalies, and correlations across days and devices
- Be direct and concise. No fluff, no motivational filler
- State your confidence and which device(s) a value came from

## When the user asks for a briefing, status, or general read
1. Call get_full_context once — it returns today's detail + a 14-day window + recent workouts + the previous briefing + a briefingTemplate to follow.
2. Compose the briefing in markdown following the template.
3. Call save_briefing({ date, content }) so the dashboard picks it up (local connection only; the remote server is read-only).

## Reading the data
- A day may have several sources; the data includes per-device values plus a weighted consensus and a confidence level. Prefer consensus; note disagreement and which devices contributed.
- Recovery/readiness: reason from HRV vs its 7-day baseline (primary), resting HR vs baseline, and sleep — there is no single vendor "recovery score".
- Some sources/metrics may be absent on a given day; say so rather than inventing.
- Workouts (e.g. Strava runs) sync into this database with run detail — splits, laps, and reconstructed run/walk intervals — and ride along in get_full_context. Use them directly for training load and pacing; no separate connector is needed.

## Alert thresholds
- HRV >15% below the 7-day average → stress/illness flag
- Resting HR >5 bpm above the 14-day baseline → under stress
- Skin-temp deviation >0.5°C above baseline → early illness signal (needs ~30 days of baseline first)
- Sleep <6h for 2+ consecutive nights → sleep-debt warning
- HRV trending down + RHR trending up 3+ days → accumulating fatigue; suggest a deload
- SpO₂ <95% → flag; deep sleep <1.5h → flag

## Recommendation style
- Specific: dosages, times, durations — not vague
- Personalize using the "About the user" section below (goals, supplements, habits, constraints)
- Max 5 recommendations per briefing, ranked by impact`;

export interface BuildServerOptions {
  /**
   * When true, write tools (save_briefing, log_habit_entry) are hidden from the
   * catalog and rejected if called. Set by the public HTTP server, which opens
   * the DB read-only. The local stdio server leaves this false.
   */
  readonly?: boolean;
}

/** Build a fully-wired MCP Server over the given DB handle. Transport-agnostic. */
export function buildServer(db: Database, opts: BuildServerOptions = {}): Server {
  const readonly = opts.readonly === true;
  const server = new Server(
    { name: 'vitals-command-center', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: `${INSTRUCTIONS}\n\n## About the user\n${getUserProfile()}` },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.filter((t) => !readonly || !WRITE_TOOLS.has(t.name)).map(
      ({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }),
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (readonly && WRITE_TOOLS.has(name)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Tool "${name}" is read-only on the remote server. Run it from the local (stdio) Claude Desktop connection, which has write access.`,
          },
        ],
        isError: true,
      };
    }
    try {
      const result = await runTool(db, name, args ?? {});
      return {
        content: [
          { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      // Without this, a thrown tool error reaches the SDK as an opaque
      // "Error occurred during tool execution" with no server-side trace.
      // Log the full stack and return the real message so failures are debuggable.
      const e = err as Error;
      process.stderr.write(`[vcc-mcp] tool ${name} failed: ${e.stack ?? e.message}\n`);
      return {
        content: [{ type: 'text' as const, text: `Tool "${name}" failed: ${e.message}` }],
        isError: true,
      };
    }
  });

  return server;
}
