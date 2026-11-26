// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { katexMacros } from './scripts/katex-macros.ts';
import { siteOrigin, basePath } from './src/lib/site/config.ts';

export default defineConfig({
  site: siteOrigin,
  base: basePath,
  trailingSlash: 'always',
  integrations: [mdx(), svelte(), sitemap()],
  markdown: {
    // Astro 7 defaults to the Sätteri processor; remark-math + rehype-katex need unified.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypeKatex, { macros: katexMacros, strict: 'error', throwOnError: true }]],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
  server: { port: 4321, host: true },
});
