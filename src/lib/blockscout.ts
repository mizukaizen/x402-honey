// Shared Blockscout fetch logic — used by both prebuild script and edge API route

const WALLETS = {
  microservices: '0x1C680703D6cF7dfC9FEABb5AA28E64B869ddB3bC',
  molt:          '0x61F2eF18ab0630912D24Fd0A30288619735AfFf5',
};
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_URL      = 'https://base.blockscout.com/api/v2';

export const WINDOW_DAYS = 30;

export const KNOWN_TIERS = ['0.001', '0.002', '0.005', '0.010', '0.020', '0.050', '0.490'];

export const TIER_SHARE_COUNT: Record<string, number> = {
  '0.001': 5,
  '0.002': 3, // PromptGuard, StructExtract, ImageGuard
  '0.005': 4,
  '0.010': 2,
  '0.020': 1,
  '0.050': 1,
  '0.490': 1,
};

export interface TierData {
  daily_calls: number[];
  last_call_iso: string | null;
  wallet: string;
  share_count: number;
  max_non_zero: number;
}

export interface ActivityData {
  generated_at: string;
  window_days: number;
  tiers: Record<string, TierData>;
}

interface Transfer {
  timestamp: string;
  total: { value: string; decimals: string };
}

interface BlockscoutPage {
  items: Transfer[];
  next_page_params: Record<string, unknown> | null;
}

export function buildDayIndex(): string[] {
  const days: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    days.push(daysAgo(i));
  }
  return days;
}

export function daysAgo(days: number): string {
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

async function fetchPage(url: string, timeoutMs: number): Promise<BlockscoutPage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json() as BlockscoutPage;
  } catch {
    return null;
  }
}

async function fetchWalletTransfers(wallet: string, timeoutMs: number): Promise<Transfer[]> {
  const results: Transfer[] = [];
  const cutoff = daysAgo(WINDOW_DAYS + 1);
  let nextParams = '';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = nextParams
      ? `${BASE_URL}/addresses/${wallet}/token-transfers?${nextParams}`
      : `${BASE_URL}/addresses/${wallet}/token-transfers?filter=to&token=${USDC_CONTRACT}`;

    const page = await fetchPage(url, timeoutMs);
    if (!page) return results;

    for (const item of page.items) {
      if (item.timestamp < cutoff) return results;
      results.push(item);
    }

    if (!page.next_page_params) break;
    nextParams = new URLSearchParams(
      Object.entries(page.next_page_params).map(([k, v]) => [k, String(v)])
    ).toString();
  }

  return results;
}

export async function fetchActivity(timeoutMs = 10_000): Promise<ActivityData | null> {
  try {
    const [microTxns, moltTxns] = await Promise.all([
      fetchWalletTransfers(WALLETS.microservices, timeoutMs),
      fetchWalletTransfers(WALLETS.molt, timeoutMs),
    ]);

    const allTxns = [...microTxns, ...moltTxns];
    if (allTxns.length === 0) return null;

    const dayIndex = buildDayIndex();
    const counts: Record<string, Record<string, number>> = {};
    const lastCall: Record<string, string> = {};

    for (const txn of allTxns) {
      const tierKey = amountToTierKey(txn.total.value, txn.total.decimals);
      if (!tierKey) continue;
      const day = txn.timestamp.slice(0, 10);
      if (!counts[tierKey]) counts[tierKey] = {};
      counts[tierKey][day] = (counts[tierKey][day] ?? 0) + 1;
      if (!lastCall[tierKey] || txn.timestamp > lastCall[tierKey]) {
        lastCall[tierKey] = txn.timestamp;
      }
    }

    const tiers: Record<string, TierData> = {};
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

    return {
      generated_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      tiers,
    };
  } catch {
    return null;
  }
}
