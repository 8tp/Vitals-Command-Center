// Thin facade over packages/shared confidence utilities so routes can `import from './confidence.js'`
// and we can add API-side logic (e.g. "downgrade if last sync > 2 days stale") without touching shared.

export { confidenceFromSources, confidenceFromSpread, ALERT_THRESHOLDS } from '@vcc/shared';
