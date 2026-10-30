# VQEG Website

This repository holds the website of the Video Quality Experts Group (VQEG). It is a static site built with [Astro](https://astro.build). The pages are MDX files: Markdown with optional components. GitHub Actions builds the site and publishes it on GitHub Pages.

The site was migrated from the old vqeg.org (Umbraco) at NTIA/ITS. The meeting and publication files were moved to a Cloudflare R2 bucket.

## How the site is built

Every page is an MDX file in `src/data/page/`. The file path is the URL. For example, `src/data/page/projects/qah.mdx` becomes `/projects/qah`.

When Astro builds the site, it runs three steps on the Markdown of every page. They are in `src/remark/`:

- `archive-accordions.mjs` turns each level-3 heading with a bulleted list below it into a collapsed section. This only happens on the Meetings and the Publications and Software pages.
- `rewrite-archive-urls.mjs` turns archive links into links to the R2 bucket (see below).
- `rewrite-root-urls.mjs` adds `BASE_PATH` to links that start with `/`, in case the site is published below a sub-path.

Page layouts and components are in `src/layouts/` and `src/components/`. Images and small downloads are in `public/media/`.

## Editing content

See [CONTENT-EDITING.md](CONTENT-EDITING.md) for the editor guide. In short:

- Edit the MDX files in `src/data/page/` in any text editor, or on GitHub in the browser.
- Each push to `master` rebuilds and publishes the site within a few minutes.
- Keep the `source` line in the frontmatter unchanged. It names the page of the old site that the file came from.

The page editor at `/decapcms/` does not work at the moment. It uses Netlify for login, and the site is no longer hosted there. It will be replaced with Sveltia CMS, which works with a GitHub login.

## Meeting and publication files

The meeting and publication files (about 2,400 files, 6.2 GB) are not in this repository. They are in the Cloudflare R2 bucket `vqeg-meeting-files` of the VQEG Cloudflare account, with these keys:

- `meetings/<meeting folder>/<file name>`, for example `meetings/2025_05_Meta_USA/agenda.pdf`
- `publications/<folder>/<file name>`

Pages link to these files with `archive:` links:

```md
- [agenda.pdf](archive:meetings/2025_05_Meta_USA/agenda.pdf) (0.2 MB)
```

During the build, each `archive:` link becomes a link to the public URL of the bucket, set by `ARCHIVE_URL`. So the HTML has links such as `https://pub-….r2.dev/meetings/2025_05_Meta_USA/agenda.pdf`, while the MDX file only has the key. To move the archive to another address, such as `archive.vqeg.org`, change `ARCHIVE_URL` and rebuild; the pages stay as they are.

Write spaces in file names as `%20`, and parentheses as `%28` and `%29`. The build decodes these.

Until October 2026, the pages linked to the old download URLs of vqeg.org (`/umbraco/surface/FolderList/GetFile?directory=…&filename=…&pageId=…`). Then all links were changed to `archive:` links. The old URL of a file can still be built from its key: the directory and file name are the same, and the page ID is 1669 for meetings and 5448 for publications. Two files were already missing on the old server. They are listed without a link and marked "file not available".

### Adding files to the archive

At the moment, files go into the bucket by hand:

- For a few files, upload them on the R2 page of the Cloudflare dashboard. This needs a login to the VQEG Cloudflare account.
- For many files, use [scripts/archive-to-r2.mjs](scripts/archive-to-r2.mjs). Put the files in a local folder with the same structure as the bucket and run the `upload` step. The comment at the top of the script describes the setup.

The script has more steps:

- `download` gets every linked file from the old vqeg.org into the local folder, as long as the old server is online.
- `verify` compares the local folder with the bucket.
- `links` lists all `archive:` links without a file in the bucket.

Then add the links to the page by hand. A simpler way, with an upload page and file lists generated from the bucket, is planned.

## Requirements

Use Node.js 22.23.4 or later. Install the dependencies once:

```sh
npm install
```

## Local development

Start the development server in the background:

```sh
npx astro dev --background
```

The site is then at http://localhost:4321. Manage the server with these commands:

- `npx astro dev status`
- `npx astro dev logs`
- `npx astro dev stop`

Before publishing, run the checks and a production build:

```sh
npm run check
npm run build
```

The built site is in `dist/`.

## Deployment

This repository is the organization Pages site of the [VQEG GitHub organization](https://github.com/VQEG). [The deployment workflow](.github/workflows/deploy.yml) builds the `master` branch and publishes it at `https://vqeg.github.io/`.

GitHub repository variables set where the site is published:

- `SITE_URL`: origin of the site, now `https://vqeg.github.io`, later `https://vqeg.org`
- `BASE_PATH`: optional path below the origin. Leave it unset when the site is at the root of the domain.
- `ARCHIVE_URL`: public URL of the R2 bucket, later `https://archive.vqeg.org`. Without it, the build uses the r2.dev development URL of the bucket.

Use the same variables to build elsewhere. Without them, the site runs at the root of `http://localhost:4321`.

Other VQEG repositories publish their project sites under the same domain, for example `/software-tools/`, `/doi/` and `/number-of-subjects/`. Do not create pages at these paths. Link to them with URLs that start with `/`. They do not exist on the local development server.

### Switching to vqeg.org

The domain `vqeg.org` is verified for the VQEG organization in the [organization Pages settings](https://github.com/organizations/VQEG/settings/pages). To switch the site to `vqeg.org`:

1. Point the DNS records to GitHub Pages: `A` records for `vqeg.org` to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`, `AAAA` records to `2606:50c0:8000::153` to `2606:50c0:8003::153`, and a `CNAME` record for `www.vqeg.org` to either `vqeg.github.io` (recommended by GitHub) or `vqeg.org` (the current record, which also works). The records must not be proxied.
2. Set `vqeg.org` as the custom domain in the [repository Pages settings](https://github.com/VQEG/vqeg.github.io/settings/pages). Do not add a `public/CNAME` file; the deployment workflow does not use it.
3. Set the `SITE_URL` variable to `https://vqeg.org` and run the deployment workflow again.
4. Enable "Enforce HTTPS" once GitHub has issued the certificate.

After the switch, the `vqeg.github.io` URLs, including those of the project sites, redirect to `vqeg.org`.

Old download links to `vqeg.org/umbraco/surface/FolderList/GetFile?directory=…&filename=…` from other sites will stop working after the switch, because GitHub Pages ignores query strings. Once the DNS of vqeg.org is in the VQEG Cloudflare account, a Cloudflare redirect rule can send them to `archive.vqeg.org/meetings/<directory>/<filename>`.
