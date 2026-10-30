#!/usr/bin/env node

/**
 * Copy the meeting and publication files to Cloudflare R2 and check the archive links on the
 * website against the bucket.
 *
 * The file list comes from the archive: links in src/data/page. The download step gets the
 * files from the old vqeg.org (Umbraco) to a local mirror, the upload step copies the mirror to
 * R2 with rclone. Every step can be re-run: files that are already complete are skipped.
 *
 * Requirements:
 *   - Node.js 18 or newer and curl (download step)
 *   - rclone (upload, verify and links steps), e.g. `brew install rclone`. Wrangler is not used:
 *     it cannot list or check objects and uploads files only up to 300 MB.
 *   - An R2 API token with "Object Read & Write" access to the bucket ("Object Read only" is
 *     enough for verify and links). Create it in the Cloudflare dashboard under
 *     R2 > Manage API tokens. It shows the access key ID and the secret access key. The
 *     account ID is on the R2 overview page.
 *
 * Steps:
 *   download  Download every linked file from the old vqeg.org to ARCHIVE_DIR/files. Skip files
 *             whose local size matches the size on the old server. Write
 *             ARCHIVE_DIR/download-report.json with failed downloads and files missing on the
 *             old server. With --local, skip files that exist locally without checking the old
 *             server.
 *   upload    Copy ARCHIVE_DIR/files to the bucket with `rclone copy`. Skip files that are
 *             already in the bucket with the same checksum. The folder structure in
 *             ARCHIVE_DIR/files is the key structure in the bucket, for example
 *             files/meetings/2026_05_AGH_Poland/agenda.pdf. Files added to the folder by hand
 *             are uploaded too.
 *   verify    Compare size and MD5 of every file in ARCHIVE_DIR/files with its copy in the bucket.
 *   links     List every archive: link in src/data/page that has no file in the bucket.
 *   all       Run download, upload and verify (default).
 *
 * Usage:
 *   node scripts/archive-to-r2.mjs download
 *   node scripts/archive-to-r2.mjs download --local
 *
 *   export R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
 *   node scripts/archive-to-r2.mjs upload
 *   node scripts/archive-to-r2.mjs verify
 *   node scripts/archive-to-r2.mjs links
 *
 * Environment:
 *   ARCHIVE_DIR           Local mirror directory (default: ../vqeg-archive-mirror)
 *   R2_ACCOUNT_ID         Cloudflare account ID (upload, verify and links only)
 *   R2_ACCESS_KEY_ID      R2 API token access key ID (upload, verify and links only)
 *   R2_SECRET_ACCESS_KEY  R2 API token secret access key (upload, verify and links only)
 *   R2_BUCKET             R2 bucket name (default: vqeg-meeting-files)
 *
 * Object keys in R2: meetings/<directory>/<filename> and publications/<directory>/<filename>,
 * with the original directory and file names.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveKey, archiveScheme } from '../src/remark/rewrite-archive-urls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pagesDir = join(root, 'src/data/page');
const archiveDir = resolve(process.env.ARCHIVE_DIR ?? join(root, '../vqeg-archive-mirror'));
const filesDir = join(archiveDir, 'files');
const partsDir = join(archiveDir, 'parts');
const bucket = process.env.R2_BUCKET ?? 'vqeg-meeting-files';
const args = process.argv.slice(2);
// Skip existing local files without checking their size on the old server
const localOnly = args.includes('--local');

// Number of parallel downloads
const concurrency = 4;

// Body that the old server returns (with status 200) for a missing file
const missingBody = 'File does not exist.';

// Download URL and page ID on the old vqeg.org for each key prefix in R2
const oldDownloadUrl = 'https://vqeg.org/umbraco/surface/FolderList/GetFile';
const oldPageIds = { meetings: 1669, publications: 5448 };

// Markdown link to an archive file
const linkPattern = new RegExp(`\\]\\((${archiveScheme}[^\\s)]*(?:\\([^\\s)]*\\)[^\\s)]*)*)\\)`, 'g');

/** Return the MDX files below a directory. */
function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name.endsWith('.mdx') ? [path] : [];
  });
}

/** Return the archive links on the website as a map from object key to page file. */
function archiveLinks() {
  const links = new Map();
  for (const page of pages(pagesDir)) {
    for (const match of readFileSync(page, 'utf8').matchAll(linkPattern)) {
      links.set(archiveKey(match[1]), relative(root, page));
    }
  }
  return links;
}

/** Return the files on the old vqeg.org that the archive links point to. */
function oldEntries() {
  return [...archiveLinks().keys()].flatMap((key) => {
    const [prefix, directory, ...rest] = key.split('/');
    const pageId = oldPageIds[prefix];
    if (!pageId || !directory || rest.length === 0) return [];
    const filename = rest.join('/');
    const url =
      `${oldDownloadUrl}?directory=${encodeURIComponent(directory)}` +
      `&filename=${encodeURIComponent(filename)}&pageId=${pageId}&m=3`;
    return [{ key, url }];
  });
}

function sizeOf(file) {
  return existsSync(file) ? statSync(file).size : -1;
}

/** Return the expected size of a file, or null if the old server does not have it. */
async function remoteSize(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const size = Number(response.headers.get('content-length'));
      if (!Number.isFinite(size)) throw new Error('no content-length');
      if (size === missingBody.length && response.headers.get('content-type')?.startsWith('text/plain')) {
        const body = await (await fetch(url)).text();
        if (body === missingBody) return null;
      }
      return size;
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((done) => setTimeout(done, 2000 * attempt));
    }
  }
}

async function downloadOne(entry) {
  const target = join(filesDir, entry.key);
  const part = join(partsDir, entry.key);
  if (localOnly && existsSync(target)) return 'skipped';
  const expected = await remoteSize(entry.url);
  if (expected === null) return 'missing';
  if (sizeOf(target) === expected) return 'skipped';

  mkdirSync(dirname(part), { recursive: true });
  // Discard a partial file that is larger than the source (for example, if the source changed)
  if (sizeOf(part) > expected) rmSync(part);
  const result = spawnSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '--location',
      '--retry',
      '5',
      '--retry-all-errors',
      '--continue-at',
      '-',
      '--output',
      part,
      entry.url,
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`curl exited with ${result.status}: ${result.stderr.trim()}`);
  const actual = sizeOf(part);
  if (actual !== expected) {
    rmSync(part, { force: true });
    throw new Error(`size mismatch: expected ${expected} bytes, got ${actual}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  renameSync(part, target);
  return 'downloaded';
}

async function download() {
  const entries = oldEntries();
  console.log(`${entries.length} files, mirror at ${archiveDir}`);
  const counts = { downloaded: 0, skipped: 0, missing: 0, failed: 0 };
  const missing = [];
  const failed = [];
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      try {
        const status = await downloadOne(entry);
        counts[status]++;
        if (status === 'missing') missing.push(entry);
      } catch (error) {
        counts.failed++;
        failed.push({ ...entry, error: error.message });
        console.error(`FAILED ${entry.key}: ${error.message}`);
      }
      done++;
      if (done % 100 === 0) console.log(`${done}/${entries.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const report = { date: new Date().toISOString(), counts, missing, failed };
  writeFileSync(join(archiveDir, 'download-report.json'), JSON.stringify(report, null, 2));
  console.log(counts);
  for (const entry of missing) console.log(`Missing on old server: ${entry.key}`);
  console.log(`Report: ${join(archiveDir, 'download-report.json')}`);
  return counts.failed === 0;
}

function rclone(args, options = {}) {
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
  }
  // Configure the "r2" remote through environment variables instead of a config file
  const env = {
    ...process.env,
    RCLONE_CONFIG_R2_TYPE: 's3',
    RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
    RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    RCLONE_CONFIG_R2_ENDPOINT: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET: 'true',
  };
  const result = spawnSync('rclone', args, { env, stdio: 'inherit', ...options });
  if (result.error?.code === 'ENOENT') throw new Error('rclone is not installed (brew install rclone)');
  if (result.error) throw result.error;
  return result;
}

function upload() {
  const args = ['copy', filesDir, `r2:${bucket}`, '--checksum', '--transfers', '8', '--retries', '5', '--progress'];
  return rclone(args).status === 0;
}

function verify() {
  // Compare size and MD5 of every local file with its copy in R2
  return rclone(['check', filesDir, `r2:${bucket}`, '--one-way']).status === 0;
}

function links() {
  const result = rclone(['lsf', `r2:${bucket}`, '--recursive', '--files-only'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return false;
  const objects = new Set(result.stdout.split('\n').filter(Boolean));
  const linked = archiveLinks();
  const missing = [...linked].filter(([key]) => !objects.has(key));
  console.log(`${linked.size} archive links, ${objects.size} files in the bucket`);
  for (const [key, page] of missing) console.log(`Missing in the bucket: ${key} (${page})`);
  return missing.length === 0;
}

const steps = { download, upload, verify, links };
const command = args.find((arg) => !arg.startsWith('--')) ?? 'all';
const selected = command === 'all' ? ['download', 'upload', 'verify'] : [command];
if (!selected.every((step) => step in steps)) {
  console.error('Usage: node scripts/archive-to-r2.mjs [download|upload|verify|links|all] [--local]');
  process.exit(2);
}
mkdirSync(filesDir, { recursive: true });
for (const step of selected) {
  console.log(`== ${step}`);
  let ok;
  try {
    ok = await steps[step]();
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
  if (!ok) {
    console.error(`${step} did not complete. Run the script again to retry.`);
    process.exit(1);
  }
}
