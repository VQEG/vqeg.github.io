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

This repository is the organization Pages site of the [VQEG GitHub organization](https://github.com/VQEG). GitHub Pages publishes the `master` branch through [the deployment workflow](.github/workflows/deploy.yml) at `https://vqeg.github.io/`.

The deployment location is configured with GitHub repository variables, not source code:

- `SITE_URL`: site origin, currently `https://vqeg.github.io`, later `https://vqeg.org`
- `BASE_PATH`: optional path below the origin; leave it unset for a root-domain deployment
- `ARCHIVE_URL`: public base URL of the R2 bucket with the meeting and publication files, such as `https://archive.vqeg.org`; defaults to the r2.dev development URL

Use the same variables when building elsewhere. Without them, local development runs at the root of `http://localhost:4321`.

The project sites of other VQEG repositories, such as `/software-tools/`, `/doi/` and `/number-of-subjects/`, are served under the same domain. Do not create pages at these paths, and link to them with root-relative URLs. They do not exist on the local development server.

### Switching to vqeg.org

The domain `vqeg.org` is verified for the VQEG organization in the [organization Pages settings](https://github.com/organizations/VQEG/settings/pages). To switch the site to `vqeg.org`:

1. Point the DNS records to GitHub Pages: `A` records for `vqeg.org` to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`, `AAAA` records to `2606:50c0:8000::153` to `2606:50c0:8003::153`, and a `CNAME` record for `www.vqeg.org` to `vqeg.github.io`. The records must not be proxied.
2. Set `vqeg.org` as the custom domain in the [repository Pages settings](https://github.com/VQEG/vqeg.github.io/settings/pages). Do not add a `public/CNAME` file; the deployment workflow does not use it.
3. Set the `SITE_URL` variable to `https://vqeg.org` and run the deployment workflow again.
4. Enable "Enforce HTTPS" once GitHub has issued the certificate.

After the switch, the `vqeg.github.io` URLs, including those of the project sites, redirect to `vqeg.org`.
