# VQEG Website

The Video Quality Experts Group (VQEG) website is a static Astro site. It was migrated from the archived vqeg.org crawl and uses MDX so that public content can be maintained without changing page code.

## Requirements

Use Node.js 22.22.3 or later. Install dependencies once from the repository root:

```sh
npm install
```

## Local development

Start the development server in the background:

```sh
npx astro dev --background
```

The site is available at http://localhost:4321. Manage the background server with these commands:

- `npx astro dev status`
- `npx astro dev logs`
- `npx astro dev stop`

Run the quality checks and production build before publishing:

```sh
npm run check
npm run build
```

The generated static site is in `dist/`.

## Editing content

Every public VQEG page and project is an MDX file in `src/data/page/`. A file path becomes its URL. For example, `src/data/page/projects/qah.mdx` is published at `/projects/qah`.

The MDX frontmatter contains a page title and an optional archive reference. Edit the title and body using Decap CMS at `/decapcms/` or in a Markdown editor. Keep `source` unchanged because it identifies the archived page used for the migration.

See [CONTENT-EDITING.md](CONTENT-EDITING.md) for the short editor guide and a new-page example.

## Media and meeting files

Public images and legacy downloads needed by the migrated pages are in `public/media/`. Use paths such as `/media/folder/file.jpg` in MDX.
These files are small and can be kept inside Git.

The multi-gigabyte meeting archive (5.7 GB as of September 2026) is intentionally excluded. Put meeting files in the designated external storage and link to them from the appropriate meeting page; do not commit that archive here.

[scripts/archive-to-r2.mjs](scripts/archive-to-r2.mjs) copies the meeting and publication files linked on the site from the old vqeg.org to Cloudflare R2. See the comment at the top of the script for requirements and usage.

## Deployment

GitHub Pages publishes the `master` branch through [the deployment workflow](.github/workflows/deploy.yml). The current public preview is available at `https://slhck.info/vqeg-website/`.

The deployment location is configured with GitHub repository variables, not source code:

- `SITE_URL`: site origin, such as `https://slhck.info` or `https://vqeg.org`
- `BASE_PATH`: optional path below the origin, such as `/vqeg-website`; leave empty for a root-domain deployment

Use the same variables when building elsewhere. Without them, local development runs at the root of `http://localhost:4321`. Do not add a `public/CNAME` file for the current preview: `slhck.info` is already configured by the account-level `slhck.github.io` Pages site.
