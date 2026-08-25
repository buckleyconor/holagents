# Manual E2E Audit Trail

Each manual milestone gate records here: **date**, target (guide dir / company /
product), **commands run**, **artifacts produced** (paths), **pass/fail per
checklist item**, and **anomalies**. This file is the audit trail in place of
automated E2E (spec 05 / 07).

Format convention: one `## M<n> — <name>` section per gate, newest last.

---

## M6 — Research pipeline

- **Date**: 2026-08-25
- **Target**: company `vastdata` (https://www.vastdata.com) — chosen as the
  "small real vendor": real AI-infrastructure vendor (NVIDIA-certified storage),
  1,510-URL sitemap. (nvidia.com probed first: sitemap has 47,700+ URLs across
  locales — not small; run.ai / dell.com / weka.io expose no discoverable
  sitemap at the probed paths.)
- **Checklist** (spec 07 M6 gate):
  - [x] **Bootstrap**: pinned scraper installed, hash-verified, idempotent re-run - `node --experimental-strip-types extensions/bootstrap-scraper.ts`
        → `installed v1.1.0 (linux-amd64) at /home/demouser/.holagent/bin/scraper`
        (18,857,902 bytes; SHA-256 verified against `scraper-manifest.json`) - re-run → `already installed` (exit 0); `~/.holagent` mode 0700;
        binary 0755; `scraper --version` → `1c6e0e74`
  - [x] **Scrape**: real vendor site scraped; selection/llms path verified;
        `scraper validate` OK - `cd ~/.holagent/companies` - `scraper sitemap discover vastdata https://www.vastdata.com`
        → 1,510 URLs, **llms.txt detected** - `scraper sitemap list vastdata` → `1510 urls 0 selected` +
        `llms.txt: https://www.vastdata.com/llms.txt` - `scraper sitemap update vastdata www.vastdata.com --select
      "https://www.vastdata.com/about"` → **selection ignored at scrape
        time** (verified v1.1.0 behavior: llms.txt present → `scrape sitemap`
        scrapes the 35 llms.txt links) - `scraper scrape sitemap vastdata www.vastdata.com` → `35 pages (35 ok)` - supplement (llms.txt omits about/blog): `scraper scrape url vastdata
      https://www.vastdata.com/about` + 3 blog posts → 40 pages total - `scraper validate vastdata` → silent, rc 0
  - [x] **Researcher**: `holagent.company-researcher` produced `company.md` +
        `style-guide.md` + product list - agent discovered via project-scope symlink
        (`.pi/agents/company-researcher.md` → `agents/company-researcher.md`);
        `subagent` list confirms runtime name `holagent.company-researcher` - blocking dispatch (`async: false`), self-contained task payload - outputs created: `company.md` (12.8 KB, all claims source-cited),
        `style-guide.md` (8.5 KB), 12-entry product list with doc URLs
  - [x] **Re-run**: idempotent summary (no duplication/corruption) - bootstrap re-run → `already installed` - `scrape sitemap` re-run (no `--force`) → `35 pages (35 ok)`; existing
        pages kept; one page (`platform/how-it-works.md`) refreshed (site
        content changed — now an 84-word overview) - researcher UPDATE re-dispatch: in-place edits only (2 to company.md,
        4 to style-guide.md); fingerprint stable — company.md 97→97 lines,
        9→9 H1/H2 headings, 12→12 product rows; style-guide.md 99→100 (one
        appended Sources entry); **zero duplicate sections/rows**; no
        contradictions; Sources appended not re-listed
  - [x] **Author fact-check**: company.md claims spot-checked against scraped
        pages (2026-08-25, author = build operator): - Gartner MQ leader claim ✓ (`blog/vast-data-introduces-version-5-2.md`:
        "Gartner® named us as a leader in the Magic Quadrant™ for File and O…") - `>11 TB/s`, `>99.999%`, `3M+ GPUs in production` ✓
        (`platform/ai-os.md` lines 63–71) - `~6.4 PB recovered`, `21–28%` competitor overhead, `<12%` total ✓
        (`usecase/ssd-shortage.md`) - `99.9999%` availability ✓ (NVIDIA certified-storage blog, line 20) - founder "Jeff Denworth" ✓ (v5.2 blog: "our fearless founder Jeff
        Denworth") — note: initially suspected an error against a misremembered
        name; the scraped source is authoritative and consistent - Verdict: all spot-checked claims supported; profile quality high;
        gaps (thin platform pages, no docs subdomain, 38-word about page)
        honestly reported by the researcher, none invented
- **Commands**: (see checklist items; all run from
  `~/.holagent/companies` or the package root)
- **Artifacts**:
  - `~/.holagent/bin/scraper` — pinned v1.1.0 binary (hash-verified)
  - `~/.holagent/companies/vastdata/sitemaps/www.vastdata.com.json` — sitemap
    (1,510 entries + `llms_txt` field)
  - `~/.holagent/companies/vastdata/website/www.vastdata.com/` — 40 scraped
    pages + `index.json`
  - `~/.holagent/companies/vastdata/company.md` — company profile (created,
    then updated in place)
  - `~/.holagent/companies/vastdata/style-guide.md` — writing style (created,
    then updated in place)
  - package: `scraper-manifest.json`, `extensions/bootstrap-scraper.ts`,
    `test/bootstrap.test.ts` (T-52a–j), `agents/company-researcher.md`,
    `agents/product-researcher.md`, `prompts/hol-research-company.md`,
    `prompts/hol-research-product.md`, updated `skills/scrape-website/*`
- **Anomalies**:
  1. **llms.txt auto-detection (verified gate finding)**: v1.1.0 `discover`
     records `llms_txt` when present; `scrape sitemap` then scrapes the
     llms.txt page list and **ignores URL selection**. Discovered during this
     gate (first cli.md draft had omitted it). Documented in
     `skills/scrape-website/cli.md` (Step 2 branch + `scrape sitemap` note) and
     both research prompts. llms.txt typically omits about/blog → Step 6
     supplement via `scrape url` (used here: about + 3 blog posts).
  2. **nvidia.com scale**: 47,700+ URL sitemap makes the main path slow; the
     0-URL / huge-sitemap cases are covered by the documented `scrape url`
     fallback. Not a defect.
  3. **`sitemap update` wildcard semantics**: Go `path.Match` — `*` does not
     cross `/`; `PREFIX/*` selects a subtree incl. the `PREFIX/` entry; `*`
     alone matches nothing. Verified empirically (docs.python.org probes) and
     documented in cli.md.
  4. **Re-scrape refresh**: `how-it-works.md` mtime changed on the no-`--force`
     re-run because the live page changed (now an 84-word overview). The
     researcher's update run re-sourced the mechanism claims to unchanged
     pages — no recorded fact was lost. Correct behavior, not corruption.
  5. **Task-payload approximation**: the dispatch payload's page list was
     approximate (from the sitemap, not the scrape); the researcher correctly
     relied on the actual local files and reported the discrepancies. Desired
     behavior (files are the source of truth).

**Status**: PASS (2026-08-25). Manual gate complete.
