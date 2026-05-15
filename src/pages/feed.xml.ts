import type { APIRoute } from 'astro';
import { services } from '../data/services';

// Static page entries (slug → title + description + date).
// Bump date when a page materially changes so feed readers re-fetch.
const PAGES = [
  { slug: '', title: 'melis x402 Tools — 22 pay-per-call APIs for AI agents', description: 'Boring infrastructure for AI agents. 22 pay-per-call x402 utility APIs. No accounts, no API keys. USDC on Base.', updated: '2026-05-15' },
  { slug: 'pipelines/rag', title: 'Canonical x402 RAG Pipeline', description: 'Build a secure, pay-per-call RAG pipeline using melis x402 services: ScrapePay → MarkdownOpt → EmbedPay → MemoryServe → MEMSCRUB. ~$0.017 per page.', updated: '2026-05-15' },
  { slug: 'docs/getting-started', title: 'Getting Started — Pay-per-call tools in 5 minutes', description: 'Five-minute onboarding for melis x402 Tools. Install the MCP wrapper, fund a Base wallet with $1 USDC, make your first paid scrape.', updated: '2026-05-15' },
  { slug: 'agents-faq', title: 'FAQ for AI Agents — Discover, pay, integrate', description: 'Agent-builder FAQ — discovery surfaces, x402 payment flow, MCP integration, budget enforcement, prompt injection defence.', updated: '2026-05-15' },
  { slug: 'comparison/vs-firecrawl', title: 'ScrapePay vs Firecrawl', description: 'Honest comparison: x402 pay-per-call scraping vs account-based subscription scraping. When each wins.', updated: '2026-05-15' },
  { slug: 'comparison/vs-openai-embeddings', title: 'EmbedPay vs OpenAI Embeddings (direct)', description: 'Wrapper premium vs direct API: when the no-signup convenience is worth ~2.5× per token.', updated: '2026-05-15' },
  { slug: 'comparison/vs-pinecone', title: 'MemoryServe vs Pinecone', description: 'Honest comparison: x402 pay-per-call agent memory vs enterprise managed vector DB.', updated: '2026-05-15' },
  { slug: 'use-cases/agent-memory', title: 'Use case: persistent agent memory', description: 'Composition recipe for adding semantic memory to any agent runtime with MemoryServe + EmbedPay.', updated: '2026-05-15' },
  { slug: 'use-cases/content-moderation', title: 'Use case: multi-layer content moderation', description: 'Three-layer moderation: PromptGuard (input) + MEMSCRUB (RAG) + ImageGuard (images). Pay per check.', updated: '2026-05-15' },
  { slug: 'compose', title: 'Composition Recipes — 7 canonical workflows', description: 'Seven worked workflows that compose melis x402 services: safe research, notification pipeline, document generation, URL verification, RAG pipeline, content moderation, agent memory.', updated: '2026-05-15' },
  { slug: 'pricing', title: 'Pricing — 22 pay-per-call APIs from $0.0005 to $0.49', description: 'Full price table. USDC on Base, no subscriptions, no minimum spend, charge-on-success-only.', updated: '2026-05-15' },
];

export const GET: APIRoute = () => {
  const updated = new Date().toISOString();
  const base = 'https://agents.melis.ai';

  const entries: string[] = [];

  // Page entries
  for (const p of PAGES) {
    const url = p.slug ? `${base}/${p.slug}` : base;
    entries.push(`  <entry>
    <id>${url}</id>
    <title>${escapeXml(p.title)}</title>
    <link rel="alternate" type="text/html" href="${url}" />
    <updated>${p.updated}T00:00:00Z</updated>
    <summary>${escapeXml(p.description)}</summary>
    <author><name>Sean Melis</name><email>sean@melis.ai</email></author>
    <category term="page" />
  </entry>`);
  }

  // Service entries (one per service — agents subscribing to feed get notified when catalogue changes)
  for (const s of services) {
    const url = `${base}/services/${s.slug}`;
    entries.push(`  <entry>
    <id>${url}</id>
    <title>${escapeXml(s.name)} — ${escapeXml(s.priceLabel)} USDC per call</title>
    <link rel="alternate" type="text/html" href="${url}" />
    <link rel="related" type="application/json" href="${s.endpoint}/.well-known/mcp.json" />
    <updated>2026-05-15T00:00:00Z</updated>
    <summary>${escapeXml(s.tagline)}</summary>
    <content type="html">${escapeXml(s.description)}</content>
    <author><name>Sean Melis</name><email>sean@melis.ai</email></author>
    <category term="service" />
    <category term="${s.category}" />
  </entry>`);
  }

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>melis x402 Tools — release feed</title>
  <subtitle>22 pay-per-call APIs for AI agents. New services and catalogue updates as they happen.</subtitle>
  <link href="${base}/feed.xml" rel="self" type="application/atom+xml" />
  <link href="${base}" rel="alternate" type="text/html" />
  <id>${base}/feed.xml</id>
  <updated>${updated}</updated>
  <author>
    <name>Sean Melis</name>
    <email>sean@melis.ai</email>
    <uri>https://melis.ai</uri>
  </author>
  <rights>Content licensed CC-BY-4.0; code samples MIT.</rights>
  <icon>${base}/favicon.svg</icon>
  <logo>https://github.com/mizukaizen/x402-tools-mcp/raw/main/assets/logo-400.png</logo>
${entries.join('\n')}
</feed>`;

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
