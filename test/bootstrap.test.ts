import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { bootstrapScraper, type BootstrapResult } from '../extensions/bootstrap-scraper.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const BOOTSTRAP = join(pkgRoot, 'extensions', 'bootstrap-scraper.ts');

// ---- fixtures -------------------------------------------------------------

const GOOD = Buffer.from('holagent-scraped-fixture-good-bytes-0123456789');
const BAD = Buffer.from('holagent-scraped-fixture-bad-bytes-0987654321');
const GOOD_HASH = createHash('sha256').update(GOOD).digest('hex');
const BAD_HASH = createHash('sha256').update(BAD).digest('hex');

interface Harness {
  dataDir: string;
  manifestPath: string;
  close: () => Promise<void>;
  manifest: (over: Record<string, unknown>) => string; // write a manifest, return its path
}

async function makeHarness(
  asset: { url: string; sha256: string | null } | null,
  extraAssets?: Record<string, unknown>,
): Promise<Harness> {
  const root = mkdtempSync(join(tmpdir(), 'holagent-bootstrap-'));
  const dataDir = join(root, 'holagent');
  const srv = createServer((req, res) => {
    if (req.url === '/good.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(GOOD);
    } else if (req.url === '/bad.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(BAD);
    } else if (req.url === '/404') {
      res.writeHead(404);
      res.end('nope');
    } else {
      res.writeHead(500);
      res.end('unknown');
    }
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = (srv.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const assets: Record<string, unknown> = { ...(extraAssets ?? {}) };
  if (asset) assets['linux-amd64'] = { url: base + asset.url, sha256: asset.sha256 };

  const manifestPath = join(root, 'scraper-manifest.json');
  const writeManifest = (over: Record<string, unknown> = {}) => {
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          name: 'scraper',
          version: 'test-0.0.0',
          assets,
          ...over,
        },
        null,
        2,
      ),
    );
    return manifestPath;
  };
  writeManifest();
  const harness: Harness = {
    dataDir,
    manifestPath,
    close: async () => {
      await new Promise<void>((ok) => srv.close(() => ok()));
      rmSync(root, { recursive: true, force: true });
    },
    manifest: writeManifest,
  };
  return harness;
}

const run = (h: Harness, over: Record<string, unknown> = {}) =>
  bootstrapScraper({
    manifestPath: h.manifestPath,
    dataDir: h.dataDir,
    platform: 'linux',
    arch: 'amd64',
    ...over,
  });

const binPath = (h: Harness) => join(h.dataDir, 'bin', 'scraper');

// ---- T-52a: existing binary, hash matches -> already-installed, untouched --

test('T-52a existing binary + matching hash -> already-installed, bytes untouched', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    mkdirSync(join(h.dataDir, 'bin'), { recursive: true });
    writeFileSync(binPath(h), GOOD);
    const sentinel = readFileSync(binPath(h));
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'already-installed');
    assert.equal(r.version, 'test-0.0.0');
    assert.equal(
      readFileSync(binPath(h)).equals(sentinel),
      true,
      'existing binary must not be rewritten',
    );
  } finally {
    await h.close();
  }
});

// ---- T-52b: existing binary, hash MISMATCHES -> refused, not overwritten ---

test('T-52b existing binary + mismatching hash -> refused, binary not overwritten', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    mkdirSync(join(h.dataDir, 'bin'), { recursive: true });
    writeFileSync(binPath(h), BAD); // stale/other binary
    const before = readFileSync(binPath(h));
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'refused');
    assert.match(r.message, /REFUSED/);
    assert.equal(r.expected, GOOD_HASH);
    assert.equal(r.actual, BAD_HASH);
    assert.equal(
      readFileSync(binPath(h)).equals(before),
      true,
      'mismatch must not overwrite the existing binary',
    );
  } finally {
    await h.close();
  }
});

// ---- T-52c: missing binary, pinned good asset -> installed, 0755 ----------

test('T-52c missing binary + good pin -> installed with 0755 and exact bytes', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'installed');
    assert.equal(readFileSync(binPath(h)).equals(GOOD), true);
    assert.equal(statSync(binPath(h)).mode & 0o777, 0o755);
    assert.equal(statSync(h.dataDir).mode & 0o777, 0o700, 'created data dir must be 0700');
    assert.equal(existsSync(join(h.dataDir, 'bin', '.scraper.tmp-0')), false, 'no temp litter');
  } finally {
    await h.close();
  }
});

// ---- T-52d: missing binary, downloaded bytes mismatch -> refused ----------

test('T-52d missing binary + pinned hash mismatching download -> refused, nothing installed', async () => {
  const h = await makeHarness({ url: '/bad.bin', sha256: GOOD_HASH }); // download bad, expect good
  try {
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'refused');
    assert.equal(r.expected, GOOD_HASH);
    assert.equal(r.actual, BAD_HASH);
    assert.equal(
      existsSync(binPath(h)),
      false,
      'failed verification must not leave a binary behind',
    );
  } finally {
    await h.close();
  }
});

// ---- T-52e: platform without a pinned asset -> refused --------------------

test('T-52e no asset pinned for platform -> refused with pin instruction', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    h.manifest({}); // keep assets
    const r = await bootstrapScraper({
      manifestPath: h.manifestPath,
      dataDir: h.dataDir,
      platform: 'linux',
      arch: 'riscv64',
    });
    assert.equal(r.status, 'refused');
    assert.match(r.message, /no scraper asset pinned for linux-riscv64/);
  } finally {
    await h.close();
  }
});

// ---- T-52f: asset without a valid sha256 -> refused ------------------------

test('T-52f asset with null sha256 -> refused (unpinned platform pin)', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: null });
  try {
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'refused');
    assert.match(r.message, /not pinned with a valid sha256/);
    assert.equal(existsSync(binPath(h)), false);
  } finally {
    await h.close();
  }
});

// ---- T-52g: network failure -> error, not refused --------------------------

test('T-52g download failure -> error status (distinct from refusal)', async () => {
  const h = await makeHarness({ url: '/404', sha256: GOOD_HASH });
  try {
    const r = (await run(h)) as BootstrapResult;
    assert.equal(r.status, 'error');
    assert.match(r.message, /download failed: HTTP 404/);
  } finally {
    await h.close();
  }
});

// ---- T-52h: real manifest sanity (the shipped pin file parses) ------------

test('T-52h shipped scraper-manifest.json parses and pins 4 assets with 64-hex hashes', () => {
  const manifest = JSON.parse(readFileSync(join(pkgRoot, 'scraper-manifest.json'), 'utf8')) as {
    version: string;
    assets: Record<string, { sha256: string | null }>;
  };
  assert.ok(manifest.version, 'version');
  for (const k of ['linux-amd64', 'linux-arm64', 'darwin-amd64', 'darwin-arm64']) {
    assert.match(manifest.assets[k]?.sha256 ?? '', /^[a-f0-9]{64}$/, `${k} sha256`);
  }
});

// ---- T-52i: CLI end-to-end (install, then idempotent re-run) ---------------

function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', BOOTSTRAP, ...args], {
      env: { ...process.env, HOLAGENT_DATA_DIR: '' },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += String(d)));
    p.stderr.on('data', (d) => (stderr += String(d)));
    p.on('close', (code) => res({ code: code ?? -1, stdout, stderr }));
  });
}

test('T-52i CLI: installs from local server (exit 0), re-run -> already-installed (exit 0)', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    h.manifest({});
    const args = [
      '--manifest',
      h.manifestPath,
      '--data-dir',
      h.dataDir,
      '--platform',
      'linux',
      '--arch',
      'amd64',
    ];
    const r1 = await cli(args);
    assert.equal(r1.code, 0, `first run failed: ${r1.stdout} ${r1.stderr}`);
    assert.match(r1.stdout, /installed/);
    assert.equal(readFileSync(binPath(h)).equals(GOOD), true);
    const r2 = await cli(args);
    assert.equal(r2.code, 0, `second run failed: ${r2.stdout} ${r2.stderr}`);
    assert.match(r2.stdout, /already-installed/);
  } finally {
    await h.close();
  }
});

test('T-52j CLI: refusal exits 1 and prints expected/actual hashes', async () => {
  const h = await makeHarness({ url: '/good.bin', sha256: GOOD_HASH });
  try {
    h.manifest({});
    mkdirSync(join(h.dataDir, 'bin'), { recursive: true });
    writeFileSync(binPath(h), BAD);
    const r = await cli([
      '--manifest',
      h.manifestPath,
      '--data-dir',
      h.dataDir,
      '--platform',
      'linux',
      '--arch',
      'amd64',
    ]);
    assert.equal(r.code, 1, `expected exit 1, got ${r.code}: ${r.stdout} ${r.stderr}`);
    assert.match(r.stdout, /refused/i);
    assert.ok(r.stdout.includes(GOOD_HASH), 'expected hash printed');
    assert.ok(r.stdout.includes(BAD_HASH), 'actual hash printed');
  } finally {
    await h.close();
  }
});
