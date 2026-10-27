#!/usr/bin/env node

/**
 * Copy the meeting and publication files from the old vqeg.org (Umbraco) to Cloudflare R2.
 *
 * The file list comes from the download links in src/data/page/meetings.mdx and
 * src/data/page/publications-and-software.mdx. Files are downloaded to a local
 * mirror first, then copied to R2 with rclone. Every step can be re-run: files
 * that are already complete are skipped.
 *
 * Requirements:
 *   - Node.js 18 or newer and curl (download step)
 *   - rclone (upload and verify steps), e.g. `brew install rclone`. Wrangler is not used for
 *     uploads: it cannot list or check objects and uploads files only up to 300 MB.
 *   - An R2 bucket. Create it once with Wrangler (run through npx, no install needed):
 *       npx wrangler login
 *       npx wrangler r2 bucket create vqeg-meeting-files
 *   - An R2 API token with "Object Read & Write" access to the bucket. Create it in the
 *     Cloudflare dashboard under R2 > Manage API tokens. It shows the access key ID and the
 *     secret access key. The account ID is on the R2 overview page.
 *
 * Steps:
 *   download  Download every linked file to ARCHIVE_DIR/files. Skip files whose local size
 *             matches the size on the old server. Write ARCHIVE_DIR/download-report.json with
 *             failed downloads, files missing on the old server, and broken links.
 *             With --local, skip files that exist locally without checking the old server.
 *   upload    Copy ARCHIVE_DIR/files to the bucket with `rclone copy`. Skip files that are
 *             already in the bucket with the same checksum.
 *   verify    Compare size and MD5 of every local file with its copy in the bucket.
 *   all       Run download, upload and verify (default).
 *
 * Every step can be run again after an error or interruption. Partial downloads are resumed.
 *
 * Usage:
 *   node scripts/archive-to-r2.mjs download
 *   node scripts/archive-to-r2.mjs download --local
 *
 *   export R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
 *   node scripts/archive-to-r2.mjs upload
 *   node scripts/archive-to-r2.mjs verify
 *
 * Environment:
 *   ARCHIVE_DIR           Local mirror directory (default: ../vqeg-archive-mirror)
 *   R2_ACCOUNT_ID         Cloudflare account ID (upload and verify only)
 *   R2_ACCESS_KEY_ID      R2 API token access key ID (upload and verify only)
 *   R2_SECRET_ACCESS_KEY  R2 API token secret access key (upload and verify only)
 *   R2_BUCKET             R2 bucket name (default: vqeg-meeting-files)
 *
 * Object keys in R2: meetings/<directory>/<filename> and publications/<directory>/<filename>,
 * with the original directory and file names.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveKey, archivePages, parseQuery } from '../src/remark/rewrite-archive-urls.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const archiveDir = resolve(process.env.ARCHIVE_DIR ?? join(root, '../vqeg-archive-mirror'));
const filesDir = join(archiveDir, 'files');
const partsDir = join(archiveDir, 'parts');
const bucket = process.env.R2_BUCKET ?? 'vqeg-meeting-files';
const args = process.argv.slice(2);
// Skip existing local files without checking their size on the old server
const localOnly = args.includes('--local');

// Source pages
const sources = Object.keys(archivePages).map((name) => `src/data/page/${name}`);

// Number of parallel downloads
const concurrency = 4;

// Body that the old server returns (with status 200) for a missing file
const missingBody = 'File does not exist.';

const linkPattern = /\]\((https:\/\/vqeg\.org\/umbraco\/surface\/FolderList\/GetFile\?.*)\) \([0-9.]+ MB\)$/;

function readEntries() {
  const entries = new Map();
  const broken = [];
  for (const page of sources) {
    const prefix = archivePages[basename(page)];
    for (const line of readFileSync(join(root, page), 'utf8').split('\n')) {
      const match = line.match(linkPattern);
      if (!match) continue;
      const key = archiveKey(match[1], prefix);
      if (!key) {
        broken.push(match[1]);
        continue;
      }
      const { directory, filename, pageId } = parseQuery(match[1]);
      const url =
        'https://vqeg.org/umbraco/surface/FolderList/GetFile' +
        `?directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}&pageId=${pageId}&m=3`;
      entries.set(key, { key, url });
    }
  }
  return { entries: [...entries.values()], broken };
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
    ['--silent', '--show-error', '--fail', '--location', '--retry', '5', '--retry-all-errors',
      '--continue-at', '-', '--output', part, entry.url],
    { encoding: 'utf8' },
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
  const { entries, broken } = readEntries();
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

  const report = { date: new Date().toISOString(), counts, broken, missing, failed };
  writeFileSync(join(archiveDir, 'download-report.json'), JSON.stringify(report, null, 2));
  console.log(counts);
  for (const url of broken) console.log(`Broken link (no file name): ${url}`);
  for (const entry of missing) console.log(`Missing on old server: ${entry.key}`);
  console.log(`Report: ${join(archiveDir, 'download-report.json')}`);
  return counts.failed === 0;
}

function rclone(args) {
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
  const result = spawnSync('rclone', args, { env, stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') throw new Error('rclone is not installed (brew install rclone)');
  if (result.error) throw result.error;
  return result.status === 0;
}

function upload() {
  return rclone(['copy', filesDir, `r2:${bucket}`, '--checksum', '--transfers', '8', '--retries', '5', '--progress']);
}

function verify() {
  // Compare size and MD5 of every local file with its copy in R2
  return rclone(['check', filesDir, `r2:${bucket}`, '--one-way']);
}

const steps = { download, upload, verify };
const command = args.find((arg) => !arg.startsWith('--')) ?? 'all';
const selected = command === 'all' ? Object.keys(steps) : [command];
if (!selected.every((step) => step in steps)) {
  console.error('Usage: node scripts/archive-to-r2.mjs [download|upload|verify|all] [--local]');
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
