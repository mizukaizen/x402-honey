#!/usr/bin/env node
/**
 * Build-time script: fetches inbound USDC transfers for both settlement wallets
 * from Blockscout, bins by price tier and UTC day, writes src/data/activity.json.
 *
 * Run via: tsx src/lib/fetch-activity.ts
 * Hooked as prebuild in package.json.
 *
 * On Blockscout failure (3 retries + backoff), falls back to existing activity.json.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchActivity,
  buildDayIndex,
  KNOWN_TIERS,
  TIER_SHARE_COUNT,
  WINDOW_DAYS,
} from './blockscout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '../data/activity.json');

function useFallback() {
  if (existsSync(OUTPUT)) {
    console.log('[fetch-activity] Using existing activity.json as fallback');
    return;
  }
  const tiers: Record<string, unknown> = {};
  for (const tier of KNOWN_TIERS) {
    tiers[tier] = {
      daily_calls: new Array(WINDOW_DAYS).fill(0),
      last_call_iso: null,
      wallet: (['0.020', '0.050', '0.490'].includes(tier)) ? 'molt' : 'micro',
      share_count: TIER_SHARE_COUNT[tier] ?? 1,
      max_non_zero: 0,
    };
  }
  writeFileSync(OUTPUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    tiers,
    _fallback: true,
  }, null, 2));
  console.log('[fetch-activity] Written empty scaffold activity.json');
  void buildDayIndex();
}

async function main() {
  console.log('[fetch-activity] Starting Blockscout fetch...');
  const data = await fetchActivity(15_000);

  if (!data) {
    console.warn('[fetch-activity] No transactions fetched — using fallback');
    return useFallback();
  }

  console.log(`[fetch-activity] Fetched transfers, processing...`);
  writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
  console.log(`[fetch-activity] Written ${OUTPUT}`);
  for (const tier of KNOWN_TIERS) {
    const t = data.tiers[tier];
    const total = t.daily_calls.reduce((a, b) => a + b, 0);
    console.log(`  ${tier}: ${total} calls, max_day=${t.max_non_zero}`);
  }
}

main().catch(e => {
  console.error('[fetch-activity] Fatal:', e);
  useFallback();
});
