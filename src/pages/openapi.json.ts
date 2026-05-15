import type { APIRoute } from 'astro';
import { services } from '../data/services';

function jsonSchemaFromExample(example: object): object {
  const properties: Record<string, object> = {};
  for (const [key, value] of Object.entries(example)) {
    if (typeof value === 'string') {
      properties[key] = { type: 'string', example: value };
    } else if (typeof value === 'number') {
      properties[key] = { type: 'number', example: value };
    } else if (typeof value === 'boolean') {
      properties[key] = { type: 'boolean', example: value };
    } else if (Array.isArray(value)) {
      // Detect item type from the first element so the schema matches the example.
      // Without this, spectral's oas3-valid-schema-example fails when items.type
      // defaults to 'object' but examples are primitives (e.g. flags: ['foo']).
      const first = value[0];
      let itemType: string;
      if (typeof first === 'string') itemType = 'string';
      else if (typeof first === 'number') itemType = 'number';
      else if (typeof first === 'boolean') itemType = 'boolean';
      else itemType = 'object';
      properties[key] = { type: 'array', items: { type: itemType }, example: value };
    } else if (value !== null && typeof value === 'object') {
      properties[key] = { type: 'object', example: value };
    } else {
      properties[key] = { type: 'string' };
    }
  }
  return { type: 'object', properties };
}

function endpointPath(endpoint: string): { server: string; path: string } {
  const url = new URL(endpoint);
  return {
    server: url.origin,
    path: url.pathname,
  };
}

export const GET: APIRoute = () => {
  // Build unique servers list
  const serverSet = new Set<string>();
  for (const svc of services) {
    serverSet.add(endpointPath(svc.endpoint).server);
  }
  const servers = [...serverSet].map((url) => ({ url, description: `${url.replace('https://', '')} service` }));

  // Build paths.
  //
  // Path keys are namespaced as `/<slug><real-path>` (e.g. `/promptguard/score`)
  // because multiple services share the same path on different subdomains
  // (/score: promptguard, imageguard, kyaoracle | /convert: docconvert-text,
  // docconvert-pdf). OpenAPI's paths object requires unique keys, so a raw
  // `/score` key would collapse three services into one. Each path carries:
  //
  //  - a path-level `servers` override → the real service subdomain
  //  - `x-real-path` extension → the actual URL path to POST to
  //
  // Smart consumers join `servers[0].url + x-real-path` to get the real URL;
  // catalogue-style consumers can list every entry without collisions.
  const paths: Record<string, object> = {};
  for (const svc of services) {
    const { server, path } = endpointPath(svc.endpoint);
    const namespacedPath = `/${svc.slug}${path}`;
    const operationId = svc.slug.replace(/-/g, '_');

    const requestSchema = jsonSchemaFromExample(svc.requestExample);
    const responseSchema = jsonSchemaFromExample(svc.responseExample);

    paths[namespacedPath] = {
      servers: [{ url: server }],
      'x-real-path': path,
      post: {
        operationId,
        summary: svc.tagline,
        description: `${svc.description}\n\nReal endpoint: \`POST ${svc.endpoint}\`\nPrice: ${svc.priceLabel} USDC per call via x402 protocol on Base. Rate limit: ${svc.rateLimit}`,
        tags: [svc.category],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: requestSchema,
              example: svc.requestExample,
            },
          },
        },
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: responseSchema,
                example: svc.responseExample,
              },
            },
          },
          '402': {
            description: 'Payment required — x402 payment challenge. Client must pay and retry.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Payment required' },
                    accepts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          scheme: { type: 'string', example: 'exact' },
                          network: { type: 'string', example: 'base' },
                          asset: { type: 'string', example: 'USDC' },
                          amount: { type: 'string', example: svc.priceLabel },
                          payTo: { type: 'string', example: '0x1C680703D6cF7dfC9FEABb5AA28E64B869ddB3bC' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '422': {
            description: 'Validation error or blocked request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    detail: { type: 'string' },
                  },
                },
              },
            },
          },
          '451': {
            description: 'Unavailable for legal reasons (robots.txt disallows, applies to scraping services)',
          },
        },
      },
    };
  }

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'melis x402 Tools',
      version: '1.0.0',
      description:
        '22 pay-per-call x402 utility APIs for AI agents. All endpoints charge USDC on Base via the x402 protocol (HTTP 402). No accounts, no API keys, no subscriptions. Payment settles in ~2 seconds on Base (Coinbase L2).\n\nInstall the MCP wrapper: `npx @melis-ai/x402-tools-mcp`\n\nDocs: https://agents.melis.ai',
      contact: {
        name: 'Sean Melis',
        email: 'sean@melis.ai',
        url: 'https://melis.ai',
      },
      license: {
        name: 'MCP wrapper: MIT',
        url: 'https://github.com/mizukaizen/x402-tools-mcp/blob/main/LICENSE',
      },
    },
    servers,
    paths,
    tags: [
      { name: 'web', description: 'Web scraping, screenshots, and research' },
      { name: 'safety', description: 'URL risk, prompt injection, image moderation, wallet trust scoring, agent loop prevention' },
      { name: 'notify', description: 'Notifications via email, Telegram, and webhook' },
      { name: 'convert', description: 'Document and format conversion' },
      { name: 'validate', description: 'Schema, output, and content validation with signed certificates' },
      { name: 'ai', description: 'Embeddings, semantic memory, and multi-agent context relay' },
    ],
    components: {
      schemas: {
        X402PaymentChallenge: {
          type: 'object',
          description: 'Standard x402 payment challenge response',
          properties: {
            error: { type: 'string' },
            accepts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scheme: { type: 'string', enum: ['exact'] },
                  network: { type: 'string', enum: ['base'] },
                  asset: { type: 'string', enum: ['USDC'] },
                  amount: { type: 'string' },
                  payTo: { type: 'string', description: 'Settlement wallet address on Base' },
                },
              },
            },
          },
        },
      },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
