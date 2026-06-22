import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceFromSources,
  confidenceFromSpread,
  accuracyWeight,
} from '@vcc/shared';

// Confidence is the load-bearing trust signal shown on every metric. These lock
// the SPEC rules so a refactor of the scoring can't silently shift them.

describe('confidenceFromSources', () => {
  it('returns NONE when no device contributed', () => {
    assert.equal(confidenceFromSources([]), 'NONE');
  });

  it('returns MEDIUM for a single source', () => {
    assert.equal(confidenceFromSources(['fitbit']), 'MEDIUM');
  });

  it('returns HIGH once two or more distinct sources agree', () => {
    assert.equal(confidenceFromSources(['fitbit', 'oura']), 'HIGH');
    assert.equal(confidenceFromSources(['fitbit', 'oura', 'whoop']), 'HIGH');
  });

  it('counts distinct devices, not raw entries (duplicates do not promote)', () => {
    assert.equal(confidenceFromSources(['fitbit', 'fitbit']), 'MEDIUM');
  });
});

describe('confidenceFromSpread', () => {
  it('returns NONE with no finite readings', () => {
    assert.equal(confidenceFromSpread([]), 'NONE');
    assert.equal(confidenceFromSpread([Number.NaN, Number.POSITIVE_INFINITY]), 'NONE');
  });

  it('returns MEDIUM with a single finite reading', () => {
    assert.equal(confidenceFromSpread([50]), 'MEDIUM');
    assert.equal(confidenceFromSpread([50, Number.NaN]), 'MEDIUM');
  });

  it('returns HIGH when sources agree within the absolute tolerance', () => {
    assert.equal(confidenceFromSpread([50, 52], { toleranceAbs: 5 }), 'HIGH');
  });

  it('downgrades to LOW when sources diverge beyond tolerance', () => {
    assert.equal(confidenceFromSpread([50, 60], { toleranceAbs: 5 }), 'LOW');
  });

  it('honors a relative-percent tolerance', () => {
    // spread 4 over mean 52 ≈ 7.7% — outside a 5% band → LOW
    assert.equal(confidenceFromSpread([50, 54], { toleranceRelPct: 5 }), 'LOW');
    assert.equal(confidenceFromSpread([50, 51], { toleranceRelPct: 5 }), 'HIGH');
  });
});

describe('accuracyWeight', () => {
  it('ranks the primary source highest and decays down the list', () => {
    assert.equal(accuracyWeight('hrv', 'fitbit'), 1.0);
    assert.equal(accuracyWeight('hrv', 'oura'), 0.7);
    assert.equal(accuracyWeight('hrv', 'whoop'), 0.5);
    assert.equal(accuracyWeight('hrv', 'apple'), 0.3);
  });

  it('returns 0 for a device absent from a metric ranking', () => {
    // strain is WHOOP-only — fitbit must not vote in it.
    assert.equal(accuracyWeight('strain', 'fitbit'), 0);
  });

  it('falls back to the default source order for an unknown metric', () => {
    // Unknown metric → DEVICE_SOURCES order [fitbit, whoop, oura, apple].
    assert.equal(accuracyWeight('made_up_metric', 'fitbit'), 1.0);
    assert.equal(accuracyWeight('made_up_metric', 'whoop'), 0.7);
  });
});
