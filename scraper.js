#!/usr/bin/env node
/**
 * My Nordic Race Results scraper for Endurance Promotions.
 *
 * Crawls the public Endurance Promotions results index and result-detail pages,
 * then writes a JSON file that the NRR frontend importer already understands.
 *
 * Usage:
 *   npm install
 *   npx playwright install chromium
 *   node scraper.js --sport nordic --out results.json
 *
 * The scraper is intentionally conservative: it only reads public result pages,
 * does not log in, and does not submit forms or modify Endurance Promotions.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const { chromium } = require('playwright');

const BASE = 'https://www.endurancepromotions.com';
const RESULTS_URL = `${BASE}/Results.aspx`;

const DEFAULTS = {
  sport: 'nordic',
  out: path.resolve(process.cwd(), 'results.json'),
  maxRaces: Infinity,
  concurrency: 3,
  timeout: 30000,
};

const NORDIC_KEYWORDS = [
  'nordic', 'ski', 'xc', 'cross country', 'cross-country', 'super tour',
  'loppet', 'birkie', 'sisu', 'vakava', 'pre fat', 'pre-fat', 'skate',
  'classic', 'pursuit', 'interval start', 'mass start', 'roller ski',
  'rollerski', 'rollerskiing', 'snow', 'winter', 'mn senior games'
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sport') args.sport = argv[++i] || args.sport;
    else if (arg === '--out') args.out = path.resolve(process.cwd(), argv[++i] || args.out);
    else if (arg === '--max-races') args.maxRaces = Number(argv[++i] || 0) || 0;
    else if (arg === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 1) || 1);
    else if (arg === '--timeout') args.timeout = Math.max(1000, Number(argv[++i] || 30000) || 30000);
    else if (arg === '--all') args.sport = 'all';
    else if (arg === '--help' || arg === '-h') {
      console.log(`\nMy Nordic Race Results scraper\n\n` +
        `  --sport nordic|all     Filter races (default: nordic)\n` +
        `  --out results.json     Output path\n` +
        `  --max-races N          Limit number of races (useful for testing)\n` +
        `  --concurrency N        Detail-page workers (default: 3)\n` +
        `  --timeout MS           Page timeout (default: 30000)\n` +
        `  --all                  Same as --sport all\n`);
      process.exit(0);
    }
  }
  return args;
}

function clean(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function absoluteUrl(href) {
  try { return new URL(href, BASE).href; } catch { return null; }
}

function parseDate(value) {
  const text = clean(value);
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function timeToSeconds(value) {
  const text = clean(value);
  if (!text || /^(dns|dnf|dq|dsq|did not start|disqualified)$/i.test(text)) return null;
  const parts = text.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

function headerMap(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalize(h).replace(/[^a-z0-9]/g, '');
    if (key) map[key] = i;
  });
  return map;
}

function valueByHeader(row, map, ...names) {
  for (const name of names) {
    const idx = map[normalize(name).replace(/[^a-z0-9]/g, '')];
    if (idx !== undefined) return clean(row[idx]);
  }
  return '';
}

function looksNordic(race) {
  const haystack = normalize(`${race.event} ${race.location} ${race.raceType} ${race.description}`);
  return NORDIC_KEYWORDS.some(k => haystack.includes(normalize(k)));
}

async function extractResultIndex(page) {
  const queue = [RESULTS_URL];
  const visited = new Set();
  const links = new Set();

  while (queue.length && visited.size < 200) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const found = await page.evaluate(() => ({
      detailLinks: [...document.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(href => /ResultDetails\.aspx/i.test(href)),
      pageLinks: [...document.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(href => /grdResultsChangePage=/i.test(href))
    }));

    found.detailLinks.forEach(href => links.add(href));
    found.pageLinks.forEach(href => {
      if (!visited.has(href) && !queue.includes(href)) queue.push(href);
    });
  }

  return [...links];
}

async function extractDetailPages(page, url, timeout) {
  const queue = [url];
  const visited = new Set();
  const pages = [];

  while (queue.length && visited.size < 200) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    await page.goto(current, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(150);

    const snapshot = await page.evaluate(() => ({
      title: (document.querySelector('h1')?.textContent || document.title || '').trim(),
      bodyText: document.body.innerText || '',
      raceType: [...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0)
        .map(el => (el.textContent || '').trim())
        .find((x, i, a) => /^race type$/i.test(x)) ? '' : '',
      allText: [...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0)
        .map(el => (el.textContent || '').trim())
        .filter(Boolean),
      tables: [...document.querySelectorAll('table')].map(table =>
        [...table.querySelectorAll('tr')].map(tr =>
          [...tr.querySelectorAll('th,td')].map(td =>
            (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
          )
        ).filter(r => r.length)
      ),
      pageLinks: [...document.querySelectorAll('a[href]')]
        .map(a => a.href)
        .filter(href => /grdIndividualResultsChangePage=/i.test(href))
    }));

    pages.push({ url: current, snapshot });
    snapshot.pageLinks.forEach(href => {
      if (!visited.has(href) && !queue.includes(href)) queue.push(href);
    });
  }

  return pages;
}

function labelValue(allText, label) {
  const idx = allText.findIndex(x => x.toLowerCase() === label.toLowerCase());
  return idx >= 0 ? allText[idx + 1] || '' : '';
}

async function extractRace(page, url, timeout) {
  const detailPages = await extractDetailPages(page, url, timeout);
  if (!detailPages.length) throw new Error(`No result detail pages found for ${url}`);

  const first = detailPages[0].snapshot;
  const race = {
    event: first.title.replace(/^Individual Results for\s*/i, '').trim(),
    raceType: clean(labelValue(first.allText, 'Race Type')),
    raceDate: clean(labelValue(first.allText, 'Race Date')),
    location: clean(labelValue(first.allText, 'Race Location')),
    description: clean(labelValue(first.allText, 'Race Description')),
    sourceUrl: url,
    raceKey: new URL(url).searchParams.get('id') || url,
    results: [],
  };

  for (const detail of detailPages) {
    const data = detail.snapshot;
    for (const rows of data.tables) {
      if (!rows.length) continue;
      const map = headerMap(rows[0]);
      const hasName = map.firstname !== undefined || map.lastname !== undefined || map.name !== undefined;
      const hasTime = map.totaltime !== undefined || map.time !== undefined || map.resulttime !== undefined;
      if (!hasName || !hasTime) continue;

      for (const row of rows.slice(1)) {
        const firstName = valueByHeader(row, map, 'First Name', 'Firstname', 'First');
        const lastName = valueByHeader(row, map, 'Last Name', 'Lastname', 'Last');
        const name = valueByHeader(row, map, 'Name');
        let first = firstName;
        let last = lastName;
        if (!first && name) {
          const parts = name.split(/\s+/);
          first = parts.shift() || '';
          last = parts.join(' ');
        }
        if (!first && !last) continue;

        const totalTime = valueByHeader(row, map, 'Total Time', 'Time', 'Result Time');
        const place = valueByHeader(row, map, 'Pos', 'Position', 'Place', 'PIC');
        const bib = valueByHeader(row, map, 'Bib #', 'Bib', 'Bib Number');
        const team = valueByHeader(row, map, 'Team', 'Affiliation', 'School');
        const school = valueByHeader(row, map, 'School');
        const className = valueByHeader(row, map, 'Class', 'Category');
        const field = valueByHeader(row, map, 'Field', 'Race');
        const city = valueByHeader(row, map, 'City');
        const age = valueByHeader(row, map, 'Age');
        const gender = valueByHeader(row, map, 'Gender', 'Sex');
        const resultsKey = valueByHeader(row, map, 'ResultsKey', 'ResultKey');
        const raceKey = valueByHeader(row, map, 'RaceKey');

        race.results.push({
          firstName: clean(first),
          lastName: clean(last),
          team: clean(team),
          school: clean(school),
          city: clean(city),
          class: clean(className),
          field: clean(field),
          gender: clean(gender),
          age: clean(age) || null,
          bib: clean(bib) || null,
          place: Number.parseInt(place, 10) || null,
          time: clean(totalTime) || null,
          timeSeconds: timeToSeconds(totalTime),
          sourceAthleteId: resultsKey || null,
          sourceRaceId: raceKey || race.raceKey,
        });
      }
    }
  }

  const seen = new Set();
  race.results = race.results.filter(r => {
    const key = [r.sourceAthleteId, r.bib, r.firstName, r.lastName, r.time, r.place].map(normalize).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return race;
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { out[index] = await worker(items[index], index); }
      catch (error) { out[index] = { error: error?.message || String(error), item: items[index] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Endurance Promotions scraper`);
  console.log(`Sport filter: ${args.sport}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const indexPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const detailUrls = await extractResultIndex(indexPage);
    console.log(`Found ${detailUrls.length} result pages.`);

    const workerResults = await mapLimit(detailUrls, args.concurrency, async (url, i) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        const race = await extractRace(page, url, args.timeout);
        if (i % 10 === 0) console.log(`[${i + 1}/${detailUrls.length}] ${race.event} (${race.results.length} rows)`);
        return race;
      } finally {
        await page.close();
      }
    });

    const errors = workerResults.filter(x => x?.error);
    let races = workerResults.filter(x => x && !x.error && x.results?.length);

    if (args.sport !== 'all') races = races.filter(looksNordic);
    races = races.slice(0, args.maxRaces);

    const matches = races.flatMap(race => race.results.map(row => ({
      ...row,
      raceKey: race.raceKey,
      raceName: race.event,
      raceDate: parseDate(race.raceDate) || race.raceDate,
      location: race.location,
      raceType: race.raceType,
      discipline: race.raceType || 'Nordic',
      sourceUrl: race.sourceUrl,
      description: race.description,
    })));

    const payload = {
      generatedAt: new Date().toISOString(),
      source: BASE,
      sport: args.sport,
      raceCount: races.length,
      rowCount: matches.length,
      errorCount: errors.length,
      matches,
    };

    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`Wrote ${races.length} races / ${matches.length} results to ${args.out}`);
    if (errors.length) console.warn(`${errors.length} result pages failed; see scraper errors below.`);
    for (const error of errors.slice(0, 10)) console.warn(`  ${error.item}: ${error.error}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
