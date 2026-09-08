# My Nordic Race Results — Chromebook-ready edition

This repository contains the NRR web app plus a remote Endurance Promotions scraper.

## Architecture

Endurance Promotions → GitHub Actions + Playwright scraper → `public/results.json` → Vite/React app → Chromebook browser

The Chromebook only needs Chrome and an internet connection. The scraper does not run on the Chromebook.

## Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

For a test scrape:

```bash
npm run scrape:test
```

For a full Nordic scrape:

```bash
npm run scrape
```

## GitHub deployment

Use the included `.github/workflows/build-and-publish.yml`. It builds the React app and deploys it to GitHub Pages. On scheduled/manual runs it also scrapes fresh Nordic results before publishing.

The app defaults to `./results.json`, so no separate API server is required for the public GitHub Pages deployment.

## Current scraper behavior

Endurance Promotions currently exposes a public results index and individual result pages. The site has hundreds of result entries and uses ASP.NET-style pagination. The scraper is designed to discover result-detail links and their pagination links, then normalize the individual result rows for NRR.
