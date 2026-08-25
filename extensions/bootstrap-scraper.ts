/**
 * extensions/bootstrap-scraper.ts
 *
 * Deterministic bootstrap for the pinned scraper binary.
 *
 * Contract (spec 04, security §6 / A14):
 * - The package root `scraper-manifest.json` is the ONLY trusted source for
 *   the binary. Every asset entry carries an explicit SHA-256.
 * - Existing binary + matching hash -> "already-installed" (exit 0).
 * - Existing binary + MISMATCHING hash -> REFUSE (exit 1). Never overwrite an
 *   existing binary on mismatch; the manifest or the binary is wrong and a
 *   human must decide.
 * - Missing binary + pinned asset -> download to a temp file, verify SHA-256,
 *   install 0755 only on a full match ("installed", exit 0).
 * - Missing binary + BAD hash -> remove the temp file, REFUSE (exit 1). No
 *   silent re-download, no retry.
 * - Missing binary + unpinned platform -> REFUSE with a clear message (exit 1).
 * - Network/IO failure -> "error" (exit 2).
 *
 * Zero runtime deps; Node stdlib only. Erasable-only TS (no build step).
 *
 * CLI:
 *   node --experimental-strip-types extensions/bootstrap-scraper.ts \
 *     [--manifest <path>] [--data-dir <dir>] [--platform <p>] [--arch <a>]
 *
 * --platform/--arch exist for tests and cross-machine pinning; by default the
 * local platform is detected.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ScraperManifest {
  name: string;
  version: string;
  upstream?: { repo?: string; release?: string; published?: string };
  note?: string;
  assets: Record<string, { url: string; sha256: string | null; sizeBytes?: number }>;
  verified?: { date?: string; cliSurface?: string; notes?: string };
}

export type BootstrapStatus = 'already-installed' | 'installed' | 'refused' | 'error';

export interface BootstrapResult {
  status: BootstrapStatus;
  platform: string;
  arch: string;
  version: string;
  binaryPath: string;
  expected?: string;
  actual?: string;
  message: string;
}

export interface BootstrapOptions {
  /** Manifest path. Default: <package root>/scraper-manifest.json. */
  manifestPath?: string;
  /** Data dir. Default: $HOLAGENT_DATA_DIR or ~/.holagent. */
  dataDir?: string;
  /** Platform override (linux|darwin). Default: process.platform. */
  platform?: string;
  /** Arch override (amd64|arm64). Default: detected from process.arch. */
  arch?: string;
  /** fetch override (tests). Defaults to global fetch. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  /** Timeout for the download. Default 120s. */
  timeoutMs?: number;
  /** Log sink. Default: no output (the CLI wrapper prints). */
  log?: (line: string) => void;
}

const EXIT: Record<BootstrapStatus, number> = {
  'already-installed': 0,
  installed: 0,
  refused: 1,
  error: 2,
};

function detectArch(arch: string): string {
  if (arch === 'x64' || arch === 'amd64') return 'amd64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  return arch;
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function defaultManifestPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'scraper-manifest.json');
}

export function defaultDataDir(): string {
  return process.env.HOLAGENT_DATA_DIR || join(homedir(), '.holagent');
}

function fail(
  status: 'refused' | 'error',
  platform: string,
  arch: string,
  version: string,
  binaryPath: string,
  message: string,
  expected?: string,
  actual?: string,
): BootstrapResult {
  return { status, platform, arch, version, binaryPath, expected, actual, message };
}

/**
 * Bootstrap the scraper binary per the manifest. Never throws on expected
 * failure modes; returns a result with status + message.
 */
export async function bootstrapScraper(opts: BootstrapOptions = {}): Promise<BootstrapResult> {
  const log = opts.log ?? (() => {});
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? detectArch(process.arch);
  const manifestPath = resolve(opts.manifestPath ?? defaultManifestPath());
  const dataDir = resolve(opts.dataDir ?? defaultDataDir());
  const binDir = join(dataDir, 'bin');
  const binaryPath = join(binDir, 'scraper');
  const fetchImpl = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const timeoutMs = opts.timeoutMs ?? 120_000;

  let manifest: ScraperManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ScraperManifest;
  } catch (err) {
    return fail(
      'error',
      platform,
      arch,
      '',
      binaryPath,
      `cannot read manifest ${manifestPath}: ${String(err)}`,
    );
  }
  const version = manifest.version ?? '?';
  if (!manifest.assets || typeof manifest.assets !== 'object') {
    return fail(
      'refused',
      platform,
      arch,
      version,
      binaryPath,
      `manifest ${manifestPath} has no assets`,
    );
  }

  const key = `${platform}-${arch}`;
  const asset = manifest.assets[key];
  if (!asset || !asset.url) {
    return fail(
      'refused',
      platform,
      arch,
      version,
      binaryPath,
      `no scraper asset pinned for ${key}; add a verified entry to ${manifestPath}`,
    );
  }
  if (!asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
    return fail(
      'refused',
      platform,
      arch,
      version,
      binaryPath,
      `asset ${key} is not pinned with a valid sha256; pin a verified release in ${manifestPath}`,
      asset.sha256 ?? undefined,
    );
  }

  // Existing binary: verify, never overwrite.
  if (existsSync(binaryPath)) {
    const actual = sha256Hex(readFileSync(binaryPath));
    if (actual === asset.sha256) {
      log(`bootstrap-scraper: already-installed ${version} (${key}) at ${binaryPath}`);
      return {
        status: 'already-installed',
        platform,
        arch,
        version,
        binaryPath,
        expected: asset.sha256,
        actual,
        message: `already installed: ${version} (${key}) at ${binaryPath}`,
      };
    }
    return fail(
      'refused',
      platform,
      arch,
      version,
      binaryPath,
      `REFUSED: existing binary ${binaryPath} does not match the pinned sha256. ` +
        `expected ${asset.sha256}, actual ${actual}. ` +
        `Do NOT overwrite it — fix ${manifestPath} (if the pin is wrong) or remove the binary (if it is stale) and retry.`,
      asset.sha256,
      actual,
    );
  }

  // Missing binary: download to a temp file in the bin dir, verify, rename.
  const dataDirPreexisted = existsSync(dataDir);
  mkdirSync(binDir, { recursive: true });
  if (!dataDirPreexisted) {
    // Security posture (spec 04): the holagent data dir is private.
    // Only tighten a dir we just created; never re-chmod a pre-existing one.
    try {
      chmodSync(dataDir, 0o700);
    } catch {
      /* best-effort */
    }
  }
  const tmp = join(binDir, `.scraper.tmp-${process.pid}`);
  try {
    const res = await fetchImpl(asset.url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return fail(
        'error',
        platform,
        arch,
        version,
        binaryPath,
        `download failed: HTTP ${res.status} for ${asset.url}`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const actual = sha256Hex(buf);
    if (actual !== asset.sha256) {
      return fail(
        'refused',
        platform,
        arch,
        version,
        binaryPath,
        `REFUSED: downloaded bytes do not match the pinned sha256 for ${key}. ` +
          `expected ${asset.sha256}, actual ${actual}. ` +
          `Temp file removed; nothing was installed. Do not retry blindly — the upstream asset may have changed; re-pin a verified release in ${manifestPath}.`,
        asset.sha256,
        actual,
      );
    }
    writeFileSync(tmp, buf);
    renameSync(tmp, binaryPath);
    // chmod after rename: writeFileSync mode is umask-affected, chmod is not.
    chmodSync(binaryPath, 0o755);
    log(`bootstrap-scraper: installed ${version} (${key}) at ${binaryPath}`);
    return {
      status: 'installed',
      platform,
      arch,
      version,
      binaryPath,
      expected: asset.sha256,
      actual,
      message: `installed ${version} (${key}) at ${binaryPath}`,
    };
  } catch (err) {
    rmSync(tmp, { force: true });
    return fail('error', platform, arch, version, binaryPath, `download error: ${String(err)}`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** CLI entry (only runs when executed directly, not when imported). */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--') && i + 1 < argv.length) {
      args[a.slice(2)] = argv[++i]!;
    }
  }
  const result = await bootstrapScraper({
    manifestPath: args.manifest,
    dataDir: args['data-dir'],
    platform: args.platform,
    arch: args.arch,
    log: (line) => console.error(line),
  });
  const exitCode = EXIT[result.status];
  console.log(`${result.status}: ${result.message}`);
  return exitCode;
}

const isDirectRun = (() => {
  try {
    const entry = process.argv[1] ? resolve(process.argv[1]) : '';
    return entry === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`bootstrap-scraper: unexpected error: ${String(err)}`);
      process.exitCode = 2;
    },
  );
}
