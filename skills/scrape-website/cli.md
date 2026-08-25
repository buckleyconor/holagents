# Scrape Website (CLI)

Discover and download relevant pages from a company or product website using the
scraper CLI. All data is written under `~/.holagent/` (override: `HOLAGENT_DATA_DIR`).

## Setup

Point the scraper at the confined data dir so it writes only inside `~/.holagent/`:

```bash
DATA_DIR="${HOLAGENT_DATA_DIR:-$HOME/.holagent}"
export SCRAPER_DATA_DIR="$DATA_DIR"
```

## Bootstrap the pinned scraper

The binary is pinned by `scraper-manifest.json` (this skill directory), which records
`version`, `arch`, `url`, and `sha256`. Never download a "latest" release — only the
pinned URL is ever fetched, and only after its hash is verified.

1. Detect the platform:

```bash
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
```

2. If `~/.holagent/bin/scraper` already exists, verify it against the manifest:

   ```bash
   ACTUAL=$(sha256sum ~/.holagent/bin/scraper | cut -d' ' -f1)
   ```
   - **Match** (`ACTUAL` = manifest `sha256`) → done, use it.
   - **Mismatch** → **stop**. Do not overwrite it. Report expected vs. actual hash
     and ask the user to fix the manifest.

3. If the binary is missing, confirm the manifest `arch` equals `$ARCH`. If not, stop
   and tell the user: "Pinned scraper is for <manifest arch>, not ${OS}/${ARCH}. Pin a
   release for your platform in `scrape-website/scraper-manifest.json` and retry."

4. Otherwise download the pinned `url` to a temp file and hash-verify it:

   ```bash
   TMP=$(mktemp)
   curl -fsSL "$MANIFEST_URL" -o "$TMP"        # or: wget -qO "$TMP" "$MANIFEST_URL"
   ACTUAL=$(sha256sum "$TMP" | cut -d' ' -f1)
   ```
   - **Match** (`ACTUAL` = manifest `sha256`) →
     `mkdir -p ~/.holagent/bin && install -m 0755 "$TMP" ~/.holagent/bin/scraper`.
   - **Mismatch** → **refuse** (no silent re-download). Remove the temp file, report
     expected vs. actual hash, and tell the user to pin the verified release in
     `scrape-website/scraper-manifest.json` and retry.

5. Verify it runs: `~/.holagent/bin/scraper --version`. Alias it for the rest:

```bash
scraper=~/.holagent/bin/scraper
```

## Commands

All commands take the scope slug first (the company slug for company research;
for product research, scope the run to the product dir as in Step 6).

```bash
scraper sitemap discover <company-slug> <url>
# Discover sitemap URLs and save them for later use.

scraper sitemap list <company-slug>
# List saved sitemaps with entry counts.

scraper sitemap get <company-slug> <domain> [--filter <pattern>] [--selected] [--offset N] [--limit N] [--lastmod-after <date>] [--changefreq <freq>]
# Show sitemap entries for a domain; supports filtering and pagination.

scraper sitemap update <company-slug> <domain> --select "*/docs/*" --select "*/blog/*" --deselect "*/careers/*"
# Select/deselect entries by URL patterns (* wildcard); --select "*" selects all.

scraper scrape sitemap <company-slug> <domain> [--force] [--spa]
# Scrape all selected URLs from a saved sitemap; --force re-scrapes, --spa for SPA sites.

scraper scrape url <company-slug> <url> [--force] [--spa]
# Scrape a single URL.

scraper links <company-slug> <domain> [--threshold N]
# Aggregate external links from scraped pages. Run AFTER scraping.

scraper validate <company-slug>
# Validate the scrape output structure.
```

## Workflow

### Step 1: Discover sitemap

```bash
scraper sitemap discover <company-slug> https://<domain>
```

### Check for llms.txt

After discovering the sitemap, check if llms.txt was detected:

```bash
scraper sitemap list <company-slug>
```

If the sitemap has `llmsTxt` or `llmsFullTxt` set, skip Steps 2-3 (review and select)
and go directly to Step 4 (scrape). The scraper uses llms.txt automatically and
ignores URL selection.

### Step 2: Review entries

```bash
scraper sitemap get <company-slug> <domain>
```

### Step 3: Select URLs to scrape

Keep: homepage, about, products, solutions, features, pricing, blog, docs, use cases,
customer stories.
Exclude: careers, legal, privacy, login, signup, press releases, media kits,
localized variants.

```bash
scraper sitemap update <company-slug> <domain> --select "*/docs/*" --select "*/blog/*" --select "*/products/*"
scraper sitemap update <company-slug> <domain> --deselect "*/careers/*" --deselect "*/legal/*"
```

### Step 4: Scrape selected URLs

```bash
scraper scrape sitemap <company-slug> <domain>
```

Use `--force` to re-scrape existing pages. Use `--spa` for SPA sites.

### Step 5: Aggregate external links

```bash
scraper links <company-slug> <domain>
```

High-count external domains are likely product or documentation sites worth scraping.

### Step 6: Scrape additional domains

For each additional domain, repeat steps 1-4. Use `scraper scrape url` for one-off
pages. For product research, scope the run so output lands under
`~/.holagent/products/<company-slug>/<product-slug>/`.

### Step 7: Validate

```bash
scraper validate <company-slug>
```

## Output Structure

```
<scope-dir>/
  manifest.json
  sitemaps/<domain>.json
  website/
    <domain>/
      index.json
      <path>.md
```

`<scope-dir>` is `~/.holagent/companies/<company-slug>` for company research and
`~/.holagent/products/<company-slug>/<product-slug>` for product research. Files are
markdown with links preserved. Same-domain links are rewritten to relative `.md` paths.

## Error handling

- **Bootstrap refusal** (hash or arch mismatch): do not install; report expected vs.
  actual values and the manifest path to fix.
- **Download failure**: stop and report the failed step; never fall back to an
  unpinned source.
- **Empty selection**: say so before scraping; never scrape with no selected URLs.
- **Validation failure**: surface `scraper validate` output and stop; do not pass
  partial output to the researcher agents.
