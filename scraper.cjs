#!/usr/bin/env node
/**
 * My Nordic Race Results - Endurance Promotions scraper.
 *
 * IMPORTANT: race IDs are NEVER hard-coded. The scraper discovers every
 * ResultDetails.aspx link from Endurance Promotions' live Results page,
 * follows the site's ASP.NET pagination, and then filters the actual race
 * details for Race Type = Skiing / Nordic keywords.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = 'https://www.endurancepromotions.com';
const RESULTS_URL = `${BASE}/Results.aspx`;

const DEFAULTS = {
  sport: 'nordic',
  out: path.resolve(process.cwd(), 'public', 'results.json'),
  maxRaces: Infinity,
  concurrency: 5,
  timeout: 30000,
};

const NORDIC_KEYWORDS = [
  'nordic', 'ski', 'xc', 'cross country', 'cross-country',
  'loppet', 'birkie', 'sisu', 'vakava', 'pre fat', 'pre-fat',
  'skate', 'classic', 'pursuit', 'interval start', 'mass start',
  'roller ski', 'rollerski', 'rollerskiing'
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sport') args.sport = argv[++i] || args.sport;
    else if (arg === '--out') args.out = path.resolve(process.cwd(), argv[++i] || args.out);
    else if (arg === '--max-races') args.maxRaces = Math.max(0, Number(argv[++i] || 0) || 0);
    else if (arg === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 1) || 1);
    else if (arg === '--timeout') args.timeout = Math.max(5000, Number(argv[++i] || 30000) || 30000);
    else if (arg === '--all') args.sport = 'all';
    else if (arg === '--help' || arg === '-h') {
      console.log('node scraper.cjs --sport nordic --out public/results.json');
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
  try {
    if (!href || /^javascript:/i.test(href.trim())) return null;
    return new URL(href.trim(), BASE).href;
  } catch {
    return null;
  }
}

function parseDate(value) {
  const m = clean(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function timeToSeconds(value) {
  const text = clean(value);
  if (!text || /^(dns|dnf|dq|dsq|did not start|disqualified)$/i.test(text)) return null;
  const parts = text.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts.length === 1 ? parts[0] : null;
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
  if (normalize(race.raceType) === 'skiing') return true;
  const haystack = normalize(`${race.event} ${race.location} ${race.description}`);
  return NORDIC_KEYWORDS.some(k => haystack.includes(normalize(k)));
}

async function readIndexPage(page) {
  return page.evaluate(() => {
    const cleanText = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const controls = [...document.querySelectorAll(
      'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
    )];
    const rows = [];
    const seen = new Set();

    // Discovery is based on actual ResultDetails links, not a guessed table
    // structure. This is the key part that makes the scraper future-proof.
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/ResultDetails\.aspx\?id=(\d+)/i);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const tr = a.closest('tr');
      rows.push({
        raceId: m[1],
        href,
        linkText: cleanText(a.textContent),
        cells: tr ? [...tr.querySelectorAll('th,td')].map(td => cleanText(td.textContent)) : []
      });
    }

    const pager = controls.map((el, index) => ({
      index,
      text: cleanText(el.textContent || el.value || el.getAttribute('alt') || ''),
      href: el.getAttribute('href') || '',
      onclick: el.getAttribute('onclick') || '',
      disabled: !!el.disabled,
      aria: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      cls: String(el.className || '')
    })).filter(x =>
      /__doPostBack|grdResults/i.test(`${x.href} ${x.onclick}`) ||
      /next|previous|forward|back/i.test(`${x.text} ${x.aria} ${x.title}`)
    );

    const info = cleanText(document.body?.innerText || '').match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    return { rows, pager, pageCount: info ? Number(info[2]) : 1 };
  });
}

async function discoverRaceUrls(page, timeout) {
  const discovered = new Map();
  await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1000);

  let expectedPages = 1;
  let nextPage = 1;
  let lastSignature = '';
  const visitedSignatures = new Set();

  for (let guard = 0; guard < 100; guard += 1) {
    const data = await readIndexPage(page);
    expectedPages = Math.max(expectedPages, data.pageCount || 1);

    for (const row of data.rows) {
      discovered.set(row.raceId, {
        id: row.raceId,
        url: absoluteUrl(row.href) || `${BASE}/ResultDetails.aspx?id=${row.raceId}`,
        linkText: row.linkText,
        cells: row.cells
      });
    }

    const signature = data.rows.map(r => r.raceId).join(',');
    if (!signature || visitedSignatures.has(signature)) break;
    visitedSignatures.add(signature);
    lastSignature = signature;

    if (visitedSignatures.size >= expectedPages) break;

    // Prefer the exact next numeric ASP.NET pager target.
    let target = data.pager.find(x => !x.disabled && x.text === String(nextPage + 1));
    if (!target) {
      target = data.pager.find(x => !x.disabled && /next|forward/i.test(`${x.text} ${x.aria} ${x.title}`));
    }
    if (!target) break;

    const locator = page.locator(
      'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
    ).nth(target.index);

    try {
      await locator.click({ timeout: Math.min(timeout, 10000) });
      await page.waitForTimeout(800);
      nextPage += 1;
    } catch {
      break;
    }
  }

  console.log(`Discovered ${discovered.size} race detail links from Endurance Promotions.`);
  return [...discovered.values()];
}

function extractMetadataFromText(text, label) {
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const wanted = normalize(label);
  const index = lines.findIndex(x => normalize(x) === wanted);
  return index >= 0 ? lines[index + 1] || '' : '';
}

async function extractRace(page, url, timeout) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(500);

  const metadata = await page.evaluate(() => {
    const cleanText = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const body = document.body?.innerText || '';
    const leaf = [...document.querySelectorAll('body *')]
      .filter(el => el.children.length === 0)
      .map(el => cleanText(el.textContent))
      .filter(Boolean);
    const labelValue = label => {
      const i = leaf.findIndex(x => x.toLowerCase() === label.toLowerCase());
      return i >= 0 ? leaf[i + 1] || '' : '';
    };

    const tables = [...document.querySelectorAll('table')].map(table =>
      [...table.querySelectorAll('tr')]
        .map(tr => [...tr.querySelectorAll('th,td')].map(td => cleanText(td.textContent)))
        .filter(r => r.length)
    );

    const resultFileLinks = [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: cleanText(a.textContent) }))
      .filter(x => /\.txt(?:\?|$)/i.test(x.href));

    const pagerControls = [...document.querySelectorAll(
      'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
    )].map((el, index) => ({
      index,
      text: cleanText(el.textContent || el.value || el.getAttribute('alt') || ''),
      href: el.getAttribute('href') || '',
      onclick: el.getAttribute('onclick') || '',
      disabled: !!el.disabled,
      aria: el.getAttribute('aria-label') || '',
      title: el.getAttribute('title') || '',
      cls: String(el.className || '')
    })).filter(x => /grdIndividualResults|__doPostBack/i.test(`${x.href} ${x.onclick}`));

    const info = body.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    return {
      title: cleanText(document.querySelector('h1')?.textContent || document.title || ''),
      raceType: labelValue('Race Type'),
      raceDate: labelValue('Race Date'),
      location: labelValue('Race Location'),
      description: labelValue('Race Description'),
      body,
      tables,
      resultFileLinks,
      pagerControls,
      pageCount: info ? Number(info[2]) : 1
    };
  });

  const event = metadata.title.replace(/^Individual Results for\s*/i, '').trim();
  const race = {
    event,
    raceType: clean(metadata.raceType) || extractMetadataFromText(metadata.body, 'Race Type'),
    raceDate: clean(metadata.raceDate) || extractMetadataFromText(metadata.body, 'Race Date'),
    location: clean(metadata.location) || extractMetadataFromText(metadata.body, 'Race Location'),
    description: clean(metadata.description) || extractMetadataFromText(metadata.body, 'Race Description'),
    sourceUrl: url,
    raceKey: new URL(url).searchParams.get('id') || url,
    results: []
  };

  const resultFiles = new Set(metadata.resultFileLinks.map(x => absoluteUrl(x.href)).filter(Boolean));
  const seenRows = new Set();

  function addRows(tables) {
    for (const rows of tables) {
      let headerIndex = -1;
      let map = null;
      // Endurance pages can have filter rows before the actual result header.
      for (let h = 0; h < Math.min(rows.length, 20); h += 1) {
        const candidate = headerMap(rows[h]);
        const hasFirst = candidate.firstname !== undefined || candidate.lastname !== undefined || candidate.name !== undefined;
        const hasTime = candidate.totaltime !== undefined || candidate.time !== undefined || candidate.resulttime !== undefined;
        if (hasFirst && hasTime) {
          headerIndex = h;
          map = candidate;
          break;
        }
      }
      if (headerIndex < 0) continue;

      for (const row of rows.slice(headerIndex + 1)) {
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

        const time = valueByHeader(row, map, 'Total Time', 'Time', 'Result Time');
        const rowKey = [
          valueByHeader(row, map, 'ResultsKey', 'ResultKey'),
          first, last, time,
          valueByHeader(row, map, 'Field', 'Race'),
          valueByHeader(row, map, 'Class', 'Category')
        ].map(normalize).join('|');
        if (seenRows.has(rowKey)) continue;
        seenRows.add(rowKey);

        race.results.push({
          firstName: clean(first),
          lastName: clean(last),
          team: valueByHeader(row, map, 'Team', 'Affiliation'),
          school: valueByHeader(row, map, 'School'),
          city: valueByHeader(row, map, 'City'),
          class: valueByHeader(row, map, 'Class', 'Category'),
          field: valueByHeader(row, map, 'Field', 'Race'),
          gender: valueByHeader(row, map, 'Gender', 'Sex'),
          age: valueByHeader(row, map, 'Age') || null,
          bib: valueByHeader(row, map, 'Bib #', 'Bib', 'Bib Number') || null,
          place: Number.parseInt(valueByHeader(row, map, 'Pos', 'Position', 'Place', 'PIC'), 10) || null,
          time: clean(time) || null,
          timeSeconds: timeToSeconds(time),
          sourceAthleteId: valueByHeader(row, map, 'ResultsKey', 'ResultKey') || null
        });
      }
    }
  }

  addRows(metadata.tables);

  // Follow the real ASP.NET pager instead of inventing query parameters.
  let currentPage = 1;
  const maxPages = Math.min(Math.max(metadata.pageCount || 1, 1), 50);
  const signatures = new Set();
  while (currentPage < maxPages) {
    const data = await page.evaluate(() => {
      const cleanText = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const controls = [...document.querySelectorAll(
        'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
      )];
      return controls.map((el, index) => ({
        index,
        text: cleanText(el.textContent || el.value || el.getAttribute('alt') || ''),
        href: el.getAttribute('href') || '',
        onclick: el.getAttribute('onclick') || '',
        disabled: !!el.disabled,
        aria: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || ''
      })).filter(x => /grdIndividualResults|__doPostBack/i.test(`${x.href} ${x.onclick}`));
    });

    const wanted = String(currentPage + 1);
    let target = data.find(x => !x.disabled && x.text === wanted);
    if (!target) target = data.find(x => !x.disabled && /next|forward/i.test(`${x.text} ${x.aria} ${x.title}`));
    if (!target) break;

    const locator = page.locator(
      'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
    ).nth(target.index);
    try {
      await locator.click({ timeout: Math.min(timeout, 10000) });
      await page.waitForTimeout(600);
    } catch {
      break;
    }

    const pageData = await page.evaluate(() => {
      const cleanText = value => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('table')].map(table =>
        [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(td => cleanText(td.textContent))).filter(r => r.length)
      );
    });
    const signature = JSON.stringify(pageData);
    if (signatures.has(signature)) break;
    signatures.add(signature);
    addRows(pageData);
    currentPage += 1;
  }

  // Some Endurance races expose downloadable TXT result sets. They are an
  // additional source, never a hard-coded race list.
  for (const fileUrl of resultFiles) {
    try {
      const response = await page.request.get(fileUrl, { timeout });
      if (!response.ok()) continue;
      const text = await response.text();
      for (const line of text.split(/\r?\n/)) {
        const m = clean(line).match(/^([0-9]+)\s+([0-9]+)\s+(.+?)\s+([0-9]{1,2})\s+(.+?)\s+([0-9]{1,3}:[0-9]{2}(?:\.[0-9]+)?)$/);
        if (!m) continue;
        const parts = m[3].trim().split(/\s+/);
        const firstName = parts.shift() || '';
        const lastName = parts.join(' ');
        const key = [firstName, lastName, m[6], m[1], m[2]].map(normalize).join('|');
        if (seenRows.has(key)) continue;
        seenRows.add(key);
        race.results.push({
          firstName, lastName, team: clean(m[5]), school: clean(m[5]), city: '', class: '', field: '',
          gender: null, age: m[4] || null, bib: m[2] || null, place: Number(m[1]), time: m[6],
          timeSeconds: timeToSeconds(m[6]), sourceAthleteId: null, sourceResultFile: fileUrl
        });
      }
    } catch (error) {
      console.warn(`Could not read ${fileUrl}: ${error.message}`);
    }
  }

  return race;
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await worker(items[i], i); }
      catch (error) { out[i] = { error: error?.message || String(error), item: items[i] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Endurance Promotions automatic Nordic scraper');
  console.log(`Sport filter: ${args.sport}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const indexPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const discovered = await discoverRaceUrls(indexPage, args.timeout);
    await indexPage.close();

    // Never hard-code race IDs. Every URL below came from the live site.
    const workerResults = await mapLimit(discovered, args.concurrency, async (candidate, i) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        const race = await extractRace(page, candidate.url, args.timeout);
        if (i % 10 === 0) console.log(`[${i + 1}/${discovered.length}] ${race.event} — ${race.raceType} — ${race.results.length} rows`);
        return race;
      } finally {
        await page.close();
      }
    });

    const errors = workerResults.filter(x => x?.error);
    let races = workerResults.filter(x => x && !x.error && x.results?.length);
    const beforeFilter = races.length;
    if (args.sport !== 'all') races = races.filter(looksNordic);
    console.log(`Races with results: ${beforeFilter}; Nordic/Skiing races: ${races.length}`);

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
      sourceRaceId: race.raceKey,
      description: race.description
    })));

    // A scraper run that discovers races but produces zero Nordic rows should
    // fail rather than silently publishing an empty dataset.
    if (args.sport !== 'all' && discovered.length > 0 && races.length === 0) {
      throw new Error('The live results site was reachable, but no Nordic/Skiing races with results were parsed. Refusing to overwrite results.json with an empty dataset.');
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      source: BASE,
      sport: args.sport,
      raceCount: races.length,
      rowCount: matches.length,
      errorCount: errors.length,
      matches
    };

    await fs.mkdir(path.dirname(args.out), { recursive: true });
    await fs.writeFile(args.out, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote ${races.length} races / ${matches.length} results to ${args.out}`);
    if (errors.length) console.warn(`${errors.length} result pages failed.`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
