import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchActivity } from '../src/lib/blockscout.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const data = await fetchActivity(10_000);

  if (!data) {
    return res
      .status(503)
      .setHeader('Cache-Control', 'no-store')
      .json({ error: 'upstream_unavailable' });
  }

  res
    .setHeader('Content-Type', 'application/json')
    .setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
    .setHeader('Access-Control-Allow-Origin', 'https://agents.melis.ai')
    .status(200)
    .json(data);
}
