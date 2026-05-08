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

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '../data/activity.json');

const WALLETS = {
  microservices: '0x1C680703D6cF7dfC9FEABb5AA28E64B869ddB3bC',
  molt:          '0x61F2eF18ab0630912D24Fd0A30288619735AfFf5',
};
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WINDOW_DAYS   = 30;
const BASE_URL      = 'https://base.blockscout.com/api/v2';

// Known price tiers (USDC, 3dp) — must match services.ts prices
const KNOWN_TIERS = ['0.001', '0.002', '0.005', '0.010', '0.020', '0.050', '0.490'];

// share_count: how many services use each tier
const TIER_SHARE_COUNT: Record<string, number> = {
  '0.001': 4,  // cacheserve, docconvert-text, schemagate, notifyrelay_webhook
  '0.002': 3,  // promptguard, structextract, notifyrelay_telegram
  '0.005': 4,  // docconvert-pdf, linkrisk, markdownopt, notifyrelay_email
  '0.010': 2,  // linksafe, scrapepay
  '0.020': 1,  // screenshot
  '0.050': 1,  // web_synthesise
  '0.490': 1,  // pdf_render
};

interface Transfer {
  timestamp: string;
  total: { value: string; decimals: string };
  token: { address: string };
}

interface BlockscoutPage {
  items: Transfer[];
  next_page_params: Record<string, unknown> | null;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<BlockscoutPage | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json() as BlockscoutPage;
    } catch (e) {
      console.warn(`[fetch-activity] attempt ${i + 1} failed: ${url} — ${(e as Error).message}`);
      if (i < retries - 1) await sleep(2 ** i * 1000);
    }
  }
  return null;
}

function utcDayKey(iso: string): string {
  return iso.slice(0, 10); // "2026-05-08"
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function amountToTierKey(rawValue: string, decimals: string): string | null {
  const dec = parseInt(decimals, 10);
  const usdc = parseFloat(rawValue) / Math.pow(10, dec);
  const key = usdc.toFixed(3);
  return KNOWN_TIERS.includes(key) ? key : null;
}

async function fetchWalletTransfers(wallet: string): Promise<Transfer[]> {
  const results: Transfer[] = [];
  const cutoff = daysAgo(WINDOW_DAYS + 1); // fetch slightly beyond window
  let nextParams: string = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // First page uses base filter; subsequent pages use next_page_params (includes filter+token)
    const url = nextParams
      ? `${BASE_URL}/addresses/${wallet}/token-transfers?${nextParams}`
      : `${BASE_URL}/addresses/${wallet}/token-transfers?filter=to&token=${USDC_CONTRACT}`;
    const page = await fetchWithRetry(url);
    if (!page) return results; // bail on repeated failure

    for (const item of page.items) {
      if (item.timestamp < cutoff) return results; // past window, stop
      results.push(item);
    }

    if (!page.next_page_params) break;
    nextParams = new URLSearchParams(
      Object.entries(page.next_page_params).map(([k, v]) => [k, String(v)])
    ).toString();
  }

  return results;
}

function buildDayIndex(): string[] {
  // Index 0 = 29 days ago, index 29 = today
  const days: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    days.push(daysAgo(i));
  }
  return days;
}

async function main() {
  console.log('[fetch-activity] Starting Blockscout fetch...');

  // Fetch both wallets in parallel
  const [microTxns, moltTxns] = await Promise.all([
    fetchWalletTransfers(WALLETS.microservices),
    fetchWalletTransfers(WALLETS.molt),
  ]);

  const allTxns = [...microTxns, ...moltTxns];

  if (allTxns.length === 0) {
    console.warn('[fetch-activity] No transactions fetched — using fallback');
    return useFallback();
  }

  console.log(`[fetch-activity] Fetched ${allTxns.length} transfers total`);

  const dayIndex = buildDayIndex(); // ["2026-04-09", ..., "2026-05-08"]

  // tier -> day -> count
  const counts: Record<string, Record<string, number>> = {};
  const lastCall: Record<string, string> = {};

  for (const txn of allTxns) {
    const tierKey = amountToTierKey(txn.total.value, txn.total.decimals);
    if (!tierKey) continue;
    const day = utcDayKey(txn.timestamp);
    if (!counts[tierKey]) counts[tierKey] = {};
    counts[tierKey][day] = (counts[tierKey][day] ?? 0) + 1;
    if (!lastCall[tierKey] || txn.timestamp > lastCall[tierKey]) {
      lastCall[tierKey] = txn.timestamp;
    }
  }

  const tiers: Record<string, {
    daily_calls: number[];
    last_call_iso: string | null;
    wallet: string;
    share_count: number;
    max_non_zero: number;
  }> = {};

  for (const tier of KNOWN_TIERS) {
    const dailyCalls = dayIndex.map(day => counts[tier]?.[day] ?? 0);
    const maxNonZero = Math.max(0, ...dailyCalls);
    tiers[tier] = {
      daily_calls: dailyCalls,
      last_call_iso: lastCall[tier] ?? null,
      wallet: (['0.020', '0.050', '0.490'].includes(tier)) ? 'molt' : 'micro',
      share_count: TIER_SHARE_COUNT[tier] ?? 1,
      max_non_zero: maxNonZero,
    };
  }

  const output = {
    generated_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    tiers,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`[fetch-activity] Written ${OUTPUT}`);
  for (const tier of KNOWN_TIERS) {
    const total = tiers[tier].daily_calls.reduce((a, b) => a + b, 0);
    console.log(`  ${tier}: ${total} calls, max_day=${tiers[tier].max_non_zero}`);
  }
}

function useFallback() {
  if (existsSync(OUTPUT)) {
    console.log('[fetch-activity] Using existing activity.json as fallback');
    return;
  }
  // No existing file — write empty scaffold
  const dayIndex = buildDayIndex();
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
  void dayIndex;
}

main().catch(e => {
  console.error('[fetch-activity] Fatal:', e);
  useFallback();
});
