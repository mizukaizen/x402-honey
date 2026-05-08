// Client-side heatmap hydration + live polling
// Imported by <script> in index.astro — runs in browser only

interface TierData {
  daily_calls: number[];
  last_call_iso: string | null;
  max_non_zero: number;
}

interface ActivityData {
  generated_at: string;
  window_days: number;
  tiers: Record<string, TierData>;
}

function opacityForCount(count: number, max: number): number {
  if (max === 0 || count === 0) return 0.07;
  return 0.18 + (count / max) * 0.82;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'no activity';
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function updateBadge(state: 'fresh' | 'stale' | 'paused' | 'error', fetchedAt: number | null) {
  const badge = document.getElementById('live-badge');
  if (!badge) return;
  badge.className = `live-badge hydrated live-badge--${state}`;

  const ageEl = badge.querySelector('.live-age') as HTMLElement | null;
  const textEl = badge.querySelector('.live-text') as HTMLElement | null;

  if (state === 'paused') {
    if (textEl) textEl.textContent = 'paused';
    if (ageEl) ageEl.textContent = '';
    return;
  }
  if (state === 'error') {
    if (textEl) textEl.textContent = 'offline';
    if (ageEl) ageEl.textContent = '';
    return;
  }

  if (textEl) textEl.textContent = 'live';
  if (fetchedAt && ageEl) {
    const secs = Math.round((Date.now() - fetchedAt) / 1000);
    ageEl.textContent = `· ${secs}s ago`;
  }
}

function updateCards(data: ActivityData) {
  const cards = document.querySelectorAll<HTMLElement>('.service-card[data-tier]');
  cards.forEach(card => {
    const tier = card.dataset.tier!;
    const tierData = data.tiers[tier];
    if (!tierData) return;

    const cells = card.querySelectorAll<HTMLElement>('.heatmap-cell');
    const max = tierData.max_non_zero;

    cells.forEach((cell, i) => {
      const newOpacity = opacityForCount(tierData.daily_calls[i] ?? 0, max);
      const oldOpacity = parseFloat(cell.style.opacity || '0.07');

      cell.style.opacity = newOpacity.toFixed(2);

      if (newOpacity > oldOpacity + 0.05) {
        cell.classList.remove('flashing');
        // Force reflow to restart animation
        void cell.offsetWidth;
        cell.classList.add('flashing');
        cell.addEventListener('animationend', () => cell.classList.remove('flashing'), { once: true });
      }
    });

    const lastCallEl = card.querySelector<HTMLElement>('.last-call');
    if (lastCallEl) {
      lastCallEl.textContent = relativeTime(tierData.last_call_iso);
    }
  });
}

let lastFetchedAt: number | null = null;
let fetchCount = 0;

async function fetchAndUpdate(): Promise<boolean> {
  try {
    const res = await fetch('/api/activity', { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ActivityData = await res.json();
    lastFetchedAt = Date.now();
    fetchCount++;
    updateCards(data);
    return true;
  } catch (e) {
    console.warn('[live-activity] fetch failed:', e);
    return false;
  }
}

function calcBadgeState(): 'fresh' | 'stale' | 'error' {
  if (!lastFetchedAt) return 'error';
  const age = Date.now() - lastFetchedAt;
  return age < 90_000 ? 'fresh' : 'stale';
}

export async function initLiveActivity() {
  // Initial hydration after page load
  const ok = await fetchAndUpdate();
  if (ok) {
    updateBadge('fresh', lastFetchedAt);
  } else {
    updateBadge('error', null);
  }

  // Poll every 60s while visible
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      const success = await fetchAndUpdate();
      if (success) {
        updateBadge(calcBadgeState(), lastFetchedAt);
      }
    }, 60_000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Visibility API — pause when hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      updateBadge('paused', null);
    } else {
      updateBadge(calcBadgeState(), lastFetchedAt);
      // Refetch immediately on tab focus if last fetch was >60s ago
      if (!lastFetchedAt || Date.now() - lastFetchedAt > 60_000) {
        fetchAndUpdate().then(success => {
          updateBadge(success ? calcBadgeState() : 'error', lastFetchedAt);
        });
      }
    }
  });

  startPolling();

  // Tick "Xs ago" counter every second
  setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    const state = calcBadgeState();
    updateBadge(state, lastFetchedAt);
  }, 1_000);
}
