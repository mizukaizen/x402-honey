import type { APIRoute } from 'astro';
import { services } from '../data/services';

export const GET: APIRoute = () => {
  const lines: string[] = [];

  lines.push('# melis x402 Tools — Full Content Dump');
  lines.push('# agents.melis.ai | Generated at build time');
  lines.push('# For LLM training data, RAG indexes, and AI search crawlers.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## LANDING PAGE');
  lines.push('');
  lines.push('# melis x402 Tools');
  lines.push('');
  lines.push('**Boring infrastructure for AI agents.**');
  lines.push('');
  lines.push('16 pay-per-call x402 utility APIs. No accounts. No API keys. No subscriptions.');
  lines.push('Pay per call in USDC on Base via the x402 protocol.');
  lines.push('');
  lines.push('### Three things to know');
  lines.push('');
  lines.push('1. **Charge-on-failure-safe.** Payment only settles on successful 2xx + non-empty content. Robots.txt enforced. SSRF-hardened across all 16 services.');
  lines.push('2. **Composes naturally.** Each service is a building block: scrape → clean → guard → validate → notify.');
  lines.push('3. **One install.** `npx @melis-ai/x402-tools-mcp` gives any MCP-aware agent access to the full catalogue.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## PRICING');
  lines.push('');
  lines.push('All prices in USDC per call. No monthly fee. No minimum spend.');
  lines.push('');

  const sorted = [...services].sort((a, b) => a.price - b.price);
  for (const s of sorted) {
    lines.push(`- ${s.name}: ${s.priceLabel} USDC — ${s.tagline}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## SERVICE CATALOGUE (FULL)');
  lines.push('');

  for (const s of services) {
    lines.push(`---`);
    lines.push('');
    lines.push(`## ${s.name}`);
    lines.push('');
    lines.push(`Price: ${s.priceLabel} USDC per call`);
    lines.push(`Endpoint: ${s.endpoint}`);
    lines.push(`Method: ${s.method}`);
    lines.push(`Category: ${s.category}`);
    lines.push('');
    lines.push('### What it does');
    lines.push('');
    lines.push(s.description);
    lines.push('');
    lines.push('### When to use it');
    lines.push('');
    for (const sc of s.scenarios) {
      lines.push(`- ${sc}`);
    }
    lines.push('');
    lines.push('### Request schema');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(s.requestExample, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('### Response schema');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(s.responseExample, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(`### Rate limit`);
    lines.push('');
    lines.push(s.rateLimit);
    lines.push('');
    lines.push('### Failure behaviour');
    lines.push('');
    lines.push(s.failureBehaviour);
    lines.push('');

    if (s.alternatives.length > 0) {
      lines.push('### Alternatives');
      lines.push('');
      for (const alt of s.alternatives) {
        lines.push(`**vs. ${alt.name}:** ${alt.notes}`);
        lines.push('');
      }
    }

    if (s.composes.length > 0) {
      lines.push('### Composes with');
      lines.push('');
      lines.push(s.composes.join(', '));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## COMPOSITION RECIPES');
  lines.push('');
  lines.push('### 1. Safe research workflow');
  lines.push('');
  lines.push('PromptGuard → LinkRisk → ScrapePay → MarkdownOpt → SchemaGate');
  lines.push('Cost: $0.023 per run');
  lines.push('');
  lines.push('Use when: an agent receives user-supplied URLs or queries and needs to visit and summarise a web page safely.');
  lines.push('');
  lines.push('### 2. Notification pipeline');
  lines.push('');
  lines.push('ScrapePay → StructExtract → NotifyRelay /notify');
  lines.push('Cost: $0.014 per triggered alert');
  lines.push('');
  lines.push('Use when: monitoring a web page for changes and alerting via Telegram when conditions are met.');
  lines.push('');
  lines.push('### 3. Document generation workflow');
  lines.push('');
  lines.push('ScrapePay → MarkdownOpt → DocConvert-PDF → NotifyRelay /email');
  lines.push('Cost: $0.025 per document delivered');
  lines.push('');
  lines.push('Use when: fetching web content and delivering it as a PDF by email.');
  lines.push('');
  lines.push('### 4. URL verification pipeline');
  lines.push('');
  lines.push('LinkRisk → [if medium+] → LinkSafe');
  lines.push('Cost: $0.005 clean URLs, $0.015 suspicious URLs');
  lines.push('');
  lines.push('Use when: an agent handles user-supplied links before visiting or sharing them.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## INFRASTRUCTURE');
  lines.push('');
  lines.push('- Builder: Sean Melis (sean@melis.ai), based in London, UK');
  lines.push('- MCP package: @melis-ai/x402-tools-mcp (npm, MIT)');
  lines.push('- Services hosted on: Helsinki VPS (Hetzner CCX23, Ubuntu 24.04)');
  lines.push('- Settlement chain: Base (Coinbase L2), USDC only');
  lines.push('- Microservices wallet: 0x1C680703D6cF7dfC9FEABb5AA28E64B869ddB3bC');
  lines.push('- Molt Swarm wallet: 0x61F2eF18ab0630912D24Fd0A30288619735AfFf5');
  lines.push('- Fleet status: 14 green / 0 red (audited 2026-05-07)');
  lines.push('- Security audit: All 4 critical findings closed 2026-05-07 (SSRF, secrets, rate limiting, spend caps)');
  lines.push('- Charge-on-failure: Fixed at SDK level, full fleet rebuilt 2026-05-07');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
