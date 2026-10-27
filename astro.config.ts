import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import compress from 'astro-compress';
import archiveAccordions from './src/remark/archive-accordions.mjs';
import rewriteArchiveUrls from './src/remark/rewrite-archive-urls.mjs';
import rewriteRootUrls from './src/remark/rewrite-root-urls.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const site = process.env.SITE_URL || 'http://localhost:4321';
const configuredBase = process.env.BASE_PATH?.trim().replace(/^\/+|\/+$/g, '');
const base = configuredBase ? `/${configuredBase}` : undefined;
// Public base URL of the R2 bucket with the meeting and publication files
const archiveUrl = process.env.ARCHIVE_URL || 'https://pub-92a02ae455b849f6b7d7ef6ec43e58b9.r2.dev';
const withBase = (pathname: string) => `${base ?? ''}${pathname}`;

export default defineConfig({
  site,
  base,
  output: 'static',
  markdown: {
    processor: unified({
      remarkPlugins: [
        archiveAccordions,
        [rewriteArchiveUrls, { archiveUrl }],
        [rewriteRootUrls, { base: base ?? '/' }],
      ],
    }),
  },
  redirects: {
    '/vqeg-home': withBase('/'),
    '/projects-home': withBase('/projects'),
    '/meetings-home': withBase('/meetings'),
    '/vqeg/publications-software-and-datasets.aspx': withBase('/publications-and-software'),
  },
  integrations: [
    mdx(),
    sitemap(),
    compress({
      CSS: { csso: false, lightningcss: { minify: true } },
      HTML: { 'html-minifier-terser': { removeAttributeQuotes: false } },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
