/**
 * Recharts axis / tooltip styling, derived from the shared CHART theme
 * (src/lib/colors.ts) so every chart reads from one source of truth. The lead's
 * dashboard charts consume CHART directly; these helpers adapt it to the
 * axis/tooltip prop shapes the secondary-page charts already use.
 */
import { CHART } from '../../lib/colors.js';

export const axisTick = {
  fill: CHART.tick,
  fontFamily: CHART.font,
  fontSize: 10,
} as const;

export const axisStroke = CHART.axis;
export const gridStroke = CHART.grid;

export const tooltipStyle = {
  background: CHART.tooltipBg,
  border: `1px solid ${CHART.tooltipBorder}`,
  borderRadius: 12,
  boxShadow: '0 4px 16px rgba(16, 32, 48, 0.10)',
  fontFamily: CHART.font,
  fontSize: 12,
  color: CHART.tooltipInk,
} as const;

export const cursorFill = CHART.cursor;
