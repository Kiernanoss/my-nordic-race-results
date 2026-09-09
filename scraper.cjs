#!/usr/bin/env node
/**
 * My Nordic Race Results scraper for Endurance Promotions.
 *
 * Reads the public Endurance Promotions race-results pages and writes the
 * JSON format used by NRR. No login, form submission, or site modification.
 *
 * Usage:
 *   node scraper.cjs --sport nordic --out public/results.json
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const { chromium } = require('playwright');

const BASE = 'https://www.endurancepromotions.com';
const RESULTS_URL = `${BASE}/Results.aspx`;

const DEFAULTS = {
  sport: 'nordic',
  out: path.resolve(process.cwd(), 'public', 'results.json'),
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
        `  --max-races N          Limit number of races\n` +
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
  try {
    if (!href) return null;
    const value = href.trim();
    if (/^javascript:/i.test(value)) return null;
    return new URL(value, BASE).href;
  } catch {
    return null;
  }
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

function pageParamUrls(baseUrl, paramName, count, pageSize = 25) {
  const urls = [];
  for (let page = 0; page < count; page += 1) {
    const u = new URL(baseUrl);
    u.searchParams.set(paramName, `${page}_${pageSize}`);
    urls.push(u.href);
  }
  return urls;
}

async function extractLinks(page, selectorTest) {
  return page.evaluate((test) => {
    const out = [];
    const seen = new Set();
    const add = (raw, text) => {
      if (!raw) return;
      const value = String(raw);
      if (!test(value, text || '')) return;
      const key = value + '|' + (text || '');
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ raw: value, text: text || '' });
      }
    };
    for (const a of document.querySelectorAll('a')) {
      add(a.getAttribute('href'), (a.textContent || '').trim());
      add(a.getAttribute('onclick'), (a.textContent || '').trim());
    }
    return out;
  }, selectorTest);
}

async function extractResultIndex(page, timeout) {
  await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(700);

  const links = new Map();
  const visit = new Set();
  const queue = [RESULTS_URL];
  let pagesVisited = 0;

  // The site uses ASP.NET GridView paging. Some versions expose page links as
  // normal hrefs; others use javascript/postback links. We inspect both and
  // also use the known GridView query-string paging format as a fallback.
  while (queue.length && pagesVisited < 50) {
    const url = queue.shift();
    if (visit.has(url)) continue;
    visit.add(url);
    pagesVisited += 1;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(300);

    const found = await page.evaluate(() => {
      const rows = [];
      for (const a of document.querySelectorAll('a[href], a[onclick]')) {
        const href = a.getAttribute('href') || '';
        const onclick = a.getAttribute('onclick') || '';
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        const raw = `${href} ${onclick}`;
        if (/ResultDetails\.aspx/i.test(raw)) rows.push({ href, onclick, text });
      }
      return rows;
    });

    for (const item of found) {
      const match = `${item.href} ${item.onclick}`.match(/(?:https?:\/\/[^'"\s]+|[^'"\s]*(?:ResultDetails\.aspx)[^'"\s]*)/i);
      const href = absoluteUrl(match ? match[0] : item.href);
      if (href && /ResultDetails\.aspx/i.test(href)) links.set(href, item.text);
    }

    const nextUrls = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href], a[onclick]')) {
        const href = a.getAttribute('href') || '';
        const onclick = a.getAttribute('onclick') || '';
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const raw = `${href} ${onclick}`;
        if (/grdResultsChangePage/i.test(raw) || /(?:^|\s)next(?:\s|$)/i.test(text)) {
          out.push({ href, onclick, text });
        }
      }
      return out;
    });

    for (const item of nextUrls) {
      const raw = item.href || item.onclick;
      const match = raw.match(/(?:https?:\/\/[^'"\s]+|Results\.aspx[^'"\s]*)/i);
      const next = absoluteUrl(match ? match[0] : raw);
      if (next && /Results\.aspx/i.test(next) && !visit.has(next)) queue.push(next);
    }

    // Explicit fallback for the site's 25-row GridView paging.
    if (pagesVisited === 1) {
      for (const u of pageParamUrls(RESULTS_URL, 'ctl00_cphMain_grdResultsChangePage', 31, 25)) {
        if (!visit.has(u)) queue.push(u);
      }
    }
  }

  console.log(`Scanned ${pagesVisited} results-index pages and found ${links.size} detail links.`);
  return [...links.keys()];
}

async function extractRacePages(page, firstUrl, timeout) {
  const urls = new Set([firstUrl]);
  const queue = [firstUrl];
  const visited = new Set();
  let pages = 0;

  while (queue.length && pages < 20) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    pages += 1;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(150);

    const nexts = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href], a[onclick]')) {
        const href = a.getAttribute('href') || '';
        const onclick = a.getAttribute('onclick') || '';
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        const raw = `${href} ${onclick}`;
        if (/grdIndividualResultsChangePage/i.test(raw) || /(?:^|\s)next(?:\s|$)/i.test(text)) {
          out.push({ href, onclick, text });
        }
      }
      return out;
    });

    for (const item of nexts) {
      const raw = item.href || item.onclick;
      const match = raw.match(/(?:https?:\/\/[^'"\s]+|ResultDetails\.aspx[^'"\s]*)/i);
      const next = absoluteUrl(match ? match[0] : raw);
      if (next && /ResultDetails\.aspx/i.test(next) && !visited.has(next)) {
        urls.add(next);
        queue.push(next);
      }
    }

    // The detail grid is also an ASP.NET GridView. Use its known 50-row paging
    // format if the page advertises more than one page.
    if (pages === 1) {
      const extra = await page.evaluate(() => (document.body.innerText || '').match(/(\d+) items? over (\d+) pages/i));
      if (extra) {
        const pageCount = Math.min(Number(extra[2]) || 1, 20);
        const base = new URL(firstUrl);
        for (let i = 0; i < pageCount; i += 1) {
          const u = new URL(base);
          u.searchParams.set('ctl00_cphMain_grdIndividualResultsChangePage', `${i}_50`);
          if (!visited.has(u.href)) {
            urls.add(u.href);
            queue.push(u.href);
          }
        }
      }
    }
  }

  return [...urls];
}


function parseTextResult(text) {
  const results = [];
  const lines = String(text || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = clean(rawLine);
    if (!line) continue;

    // Common Endurance Promotions Nordic TXT format:
    // Place Bib Name Grade School Time
    const m = line.match(/^([0-9]+)\s+([0-9]+)\s+(.+?)\s+([0-9]{1,2})\s+(.+?)\s+([0-9]{1,3}:[0-9]{2}(?:\.[0-9]+)?)$/);
    if (!m) continue;

    const [, place, bib, fullName, grade, school, totalTime] = m;
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ');

    results.push({
      firstName,
      lastName,
      team: school.trim(),
      school: school.trim(),
      city: '',
      class: '',
      field: '',
      gender: null,
      age: grade || null,
      bib: bib || null,
      place: Number.parseInt(place, 10) || null,
      time: totalTime || null,
      timeSeconds: timeToSeconds(totalTime),
      sourceAthleteId: null,
    });
  }

  return results;
}

async function fetchTextResult(page, url, timeout) {
  const response = await page.request.get(url, { timeout });
  if (!response.ok()) throw new Error(`HTTP ${response.status()} for ${url}`);
  return response.text();
}

async function extractRace(page, url, timeout) {
  const pageUrls = await extractRacePages(page, url, timeout);
  let metadata = null;
  const allResults = [];
  const resultFiles = new Set();

  for (const pageUrl of pageUrls) {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(250);

    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const title = (document.querySelector('h1')?.textContent || document.title || '').trim();
      const allText = [...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0)
        .map(el => (el.textContent || '').trim())
        .filter(Boolean);

      const labelValue = label => {
        const idx = allText.findIndex(x => x.toLowerCase() === label.toLowerCase());
        return idx >= 0 ? allText[idx + 1] || '' : '';
      };

      const tables = [...document.querySelectorAll('table')].map(table => [...table.querySelectorAll('tr')]
        .map(tr => [...tr.querySelectorAll('th,td')]
          .map(td => (td.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()))
        .filter(r => r.length));

      const resultFileLinks = [...document.querySelectorAll('a[href]')]
        .map(a => ({ href: a.href, text: (a.textContent || '').replace(/\s+/g, ' ').trim() }))
        .filter(x => /\.(txt|pdf)(\?|$)/i.test(x.href));

      return {
        title,
        bodyText: text,
        raceType: labelValue('Race Type'),
        raceDate: labelValue('Race Date'),
        location: labelValue('Race Location'),
        description: labelValue('Race Description'),
        tables,
        resultFileLinks,
      };
    });

    if (!metadata) {
      metadata = {
        event: data.title.replace(/^Individual Results for\s*/i, '').trim(),
        raceType: clean(data.raceType),
        raceDate: clean(data.raceDate),
        location: clean(data.location),
        description: clean(data.description),
        sourceUrl: url,
        raceKey: new URL(url).searchParams.get('id') || url,
        results: [],
      };
    }

    for (const link of data.resultFileLinks || []) {
      try {
        const u = absoluteUrl(link.href);
        if (u && /\.txt(\?|$)/i.test(u)) resultFiles.add(u);
      } catch {}
    }

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
        const team = valueByHeader(row, map, 'Team', 'Affiliation');
        const school = valueByHeader(row, map, 'School');
        const className = valueByHeader(row, map, 'Class', 'Category');
        const field = valueByHeader(row, map, 'Field', 'Race');
        const city = valueByHeader(row, map, 'City');
        const age = valueByHeader(row, map, 'Age');
        const gender = valueByHeader(row, map, 'Gender', 'Sex');
        const resultsKey = valueByHeader(row, map, 'ResultsKey', 'ResultKey');

        allResults.push({
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
        });
      }
    }
  }

  // Many current Nordic pages have an empty HTML grid, but link the actual
  // result sets as .TXT files. Read those files directly.
  for (const fileUrl of resultFiles) {
    try {
      const text = await fetchTextResult(page, fileUrl, timeout);
      const parsed = parseTextResult(await text);
      for (const row of parsed) {
        row.sourceResultFile = fileUrl;
        row.sourceRaceId = metadata.raceKey;
        allResults.push(row);
      }
    } catch (error) {
      console.warn(`Could not read result file ${fileUrl}: ${error.message}`);
    }
  }

  const seen = new Set();
  metadata.results = allResults.filter(r => {
    const key = [
      r.sourceResultFile || '',
      r.sourceAthleteId || '',
      r.bib || '',
      r.firstName,
      r.lastName,
      r.time || '',
      r.place || ''
    ].map(normalize).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return metadata;
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
  console.log('Endurance Promotions scraper');
  console.log(`Sport filter: ${args.sport}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const indexPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const detailUrls = await extractResultIndex(indexPage, args.timeout);
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

    const beforeFilter = races.length;
    if (args.sport !== 'all') races = races.filter(looksNordic);
    console.log(`Races with results: ${beforeFilter}; Nordic matches: ${races.length}`);

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
    if (errors.length) console.warn(`${errors.length} result pages failed.`);
    for (const error of errors.slice(0, 10)) console.warn(`  ${error.item}: ${error.error}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
