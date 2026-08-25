---
name: scrape-website
description: Bootstrap and usage for the pinned scraper binary that downloads company and product website pages into ~/.holagent. Use when /hol-research-company or /hol-research-product needs fresh web content before research.
---

# Scrape Website

Download relevant pages from a company or product website into the local data dir so
researcher agents can read them offline. The scraper is a **pinned binary** —
holagent never installs or runs an unpinned, unverified download.

## What scraping is for

- **Company research**: homepage, about, products/solutions, docs, blog →
  `company.md` + the product list for follow-up research.
- **Product research**: product documentation and tutorials → `product.md`.

All output stays under `~/.holagent/` (override: `HOLAGENT_DATA_DIR`):

- Company scope: `~/.holagent/companies/<company-slug>/` (`website/`, `sitemaps/`,
  `manifest.json`)
- Product scope: `~/.holagent/products/<company-slug>/<product-slug>/` (same layout)

## Bootstrap contract

The scraper binary lives at `~/.holagent/bin/scraper` and is pinned by
`scraper-manifest.json` (this skill directory). The manifest records exactly:

```json
{
  "version": "v1.2.3",
  "arch": "amd64",
  "url": "https://…/scraper-linux-amd64",
  "sha256": "<64 hex chars>"
}
```

Bootstrap rule (details in `cli.md`):

1. If the binary exists and its SHA-256 matches the manifest `sha256`, use it.
2. Otherwise download `url` to a temp file, compute its SHA-256, and compare.
3. **Refuse on mismatch** — print the expected and actual hashes and stop. No
   silent re-download, no overwrite of an existing binary on mismatch. The user
   updates the manifest to a verified release and retries.
4. The manifest file itself lands in a later milestone; until it exists, treat the
   bootstrap as "cannot verify — do not install".

The binary is invoked only with `SCRAPER_DATA_DIR` pointing inside `~/.holagent/`,
so every write the scraper makes stays confined to the data dir.

## Run

Read `cli.md` and follow its instructions: bootstrap, sitemap / llms.txt discovery,
page selection, scrape, external-link aggregation, and output validation.

## Re-runs

Scraping is re-runnable. Use `--force` to re-scrape pages that already exist when a
site has changed; without it the scraper keeps existing files. If you re-run
`sitemap discover` after changing your mind about scope, re-apply your `sitemap
update` selections — confirm with `sitemap get --selected` before scraping.
