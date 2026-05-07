// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://agents.melis.ai',
  integrations: [
    sitemap(),
  ],
  build: {
    format: 'directory',
  },
});
