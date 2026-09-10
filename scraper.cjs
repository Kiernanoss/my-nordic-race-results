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
  // Endurance Promotions labels Nordic races as RaceType="Skiing".
  if (normalize(race.raceType) === 'skiing') return true;
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
  const links = new Map();
  const visitedPages = new Set();

  function addRace(id, href, row = {}) {
    if (!id) return;
    const url = absoluteUrl(href) || `${BASE}/ResultDetails.aspx?id=${id}`;
    const raceType = clean(row.raceType || '');
    const raceName = clean(row.raceName || '');
    const location = clean(row.location || '');
    const date = clean(row.raceDate || '');

    // The index itself exposes RaceType. Prefer that as the filter so we
    // don't have to open hundreds of non-skiing races.
    const candidate = {
      id: String(id),
      url,
      raceType,
      raceName,
      location,
      raceDate: date,
    };

    // If the index says Skiing, always keep it. Otherwise keep rows whose
    // name/location contains a Nordic keyword. We still allow unknown types
    // through when the name clearly identifies a Nordic event.
    if (
      normalize(raceType) === 'skiing' ||
      NORDIC_KEYWORDS.some(k => normalize(`${raceName} ${location}`).includes(normalize(k)))
    ) {
      links.set(String(id), candidate);
    }
  }

  async function readCurrentIndexPage() {
    const data = await page.evaluate(() => {
      const cleanText = value => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      let best = null;

      for (const table of document.querySelectorAll('table')) {
        const rows = [...table.querySelectorAll('tr')];
        if (!rows.length) continue;

        for (let headerIndex = 0; headerIndex < Math.min(rows.length, 5); headerIndex += 1) {
          const headerCells = [...rows[headerIndex].querySelectorAll('th,td')]
            .map(x => cleanText(x.textContent));
          const normalizedHeaders = headerCells.map(x =>
            x.toLowerCase().replace(/[^a-z0-9]/g, '')
          );

          if (
            normalizedHeaders.includes('racename') &&
            normalizedHeaders.includes('racetype')
          ) {
            best = {
              table,
              rows: rows.slice(headerIndex),
              headerCells
            };
            break;
          }
        }

        if (best) break;
      }

      const result = {
        rows: [],
        pager: [],
        pageInfo: cleanText(document.body?.innerText || '')
          .match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i)
      };

      if (best) {
        const headers = best.headerCells;
        const headerMap = {};
        headers.forEach((h, i) => {
          headerMap[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = i;
        });

        for (const tr of best.rows.slice(1)) {
          const cells = [...tr.querySelectorAll('th,td')].map(x => cleanText(x.textContent));
          if (!cells.length) continue;

          const anchor = tr.querySelector('a[href*="ResultDetails.aspx"], a[href*="resultdetails.aspx"]');
          const href = anchor?.getAttribute('href') || '';
          const text = cleanText(anchor?.textContent || '');

          const idMatch = href.match(/[?&]id=(\d+)/i) || text.match(/(?:id[=:\s]+)(\d+)/i);
          const raceId = idMatch ? idMatch[1] : '';

          result.rows.push({
            raceId,
            href,
            raceName: cells[headerMap.racename] || text,
            location: cells[headerMap.location] || '',
            raceType: cells[headerMap.racetype] || '',
            raceDate: cells[headerMap.racedate] || '',
          });
        }
      }

      // Capture actual pager controls. ASP.NET may render these as
      // javascript __doPostBack links rather than ordinary URLs.
      for (const el of document.querySelectorAll('a[href], input[type="submit"], input[type="button"], button')) {
        const href = el.getAttribute('href') || '';
        const onclick = el.getAttribute('onclick') || '';
        const text = cleanText(el.textContent || el.value || '');
        const raw = `${href} ${onclick}`;
        if (/grdResults/i.test(raw) || /__doPostBack/i.test(raw)) {
          result.pager.push({ tag: el.tagName, text, href, onclick });
        }
      }

      return result;
    });

    for (const row of data.rows) {
      if (row.raceId) addRace(row.raceId, row.href, row);
    }

    return data;
  }

  async function scanCurrent(urlLabel) {
    const marker = `${urlLabel}|${await page.locator('body').innerText().catch(() => '')}`;
    // The body marker is only diagnostic; the actual visited key is the
    // current page's ASP.NET pager state.
    return readCurrentIndexPage();
  }

  await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1200);

  let data = await scanCurrent('page-1');
  let pageCount = data.pageInfo ? Number(data.pageInfo[2]) : 1;
  pageCount = Math.min(Math.max(pageCount || 1, 1), 100);

  // Prefer clicking the site's actual pager. This is important because the
  // Endurance Promotions GridView uses ASP.NET postbacks; GET query strings
  // do not reliably change the grid page.
  let nextPageNumber = 2;
  let lastSignature = '';

  for (let safety = 0; safety < pageCount + 5; safety += 1) {
    data = await readCurrentIndexPage();

    const signature = data.rows
      .slice(0, 3)
      .map(r => `${r.raceId}|${r.raceName}|${r.raceDate}`)
      .join('||');

    if (signature && signature === lastSignature) break;
    if (signature) lastSignature = signature;

    const controls = await page.locator(
      'a, input[type="submit"], input[type="button"], input[type="image"], button'
    ).evaluateAll(els =>
      els.map((el, index) => ({
        index,
        text: String(el.textContent || el.value || '').replace(/\s+/g, ' ').trim(),
        href: el.getAttribute('href') || '',
        onclick: el.getAttribute('onclick') || '',
        disabled: !!el.disabled,
        aria: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        alt: el.getAttribute('alt') || '',
        src: el.getAttribute('src') || '',
        cls: String(el.className || '')
      })).filter(x =>
        /grdResults/i.test(`${x.href} ${x.onclick}`) ||
        /__doPostBack/i.test(`${x.href} ${x.onclick}`) ||
        /next|forward|right/i.test(`${x.text} ${x.aria} ${x.title} ${x.alt} ${x.src} ${x.cls}`)
      )
    );

    let target = controls.find(c =>
      !c.disabled && Number(c.text) === nextPageNumber
    );

    // Once the numeric page number is hidden behind "...", use the site's
    // next/forward control to advance to the next page.
    if (!target) {
      target = controls.find(c =>
        !c.disabled &&
        /next|forward|right/i.test(`${c.text} ${c.aria} ${c.title} ${c.alt} ${c.src} ${c.cls}`)
      );
    }

    if (!target) break;

    const locator = page.locator(
      'a, input[type="submit"], input[type="button"], input[type="image"], button'
    ).nth(target.index);

    try {
      await locator.click({ timeout: Math.min(timeout, 10000) });
      await page.waitForTimeout(800);
    } catch (error) {
      console.warn(`Could not advance results index to page ${nextPageNumber}: ${error.message}`);
      break;
    }

    nextPageNumber += 1;
  }

  console.log(`Scanned ${visitedPages.size} results-index states and found ${links.size} Nordic/Skiing detail links.`);
  return [...links.values()].map(x => x.url);
}

async function extractRacePages(page, firstUrl, timeout) {
  const urls = new Set([firstUrl]);
  const queue = [firstUrl];
  const visited = new Set();

  while (queue.length && visited.size < 30) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(700);

    const html = await page.content();
    const body = await page.locator('body').innerText().catch(() => '');
    const match = body.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    const pageCount = Math.min(Math.max(match ? Number(match[2]) : 1, 1), 30);

    // Capture actual ASP.NET paging targets when present.
    const rawPaging = await page.evaluate(() => [...document.querySelectorAll('a[href], a[onclick]')]
      .map(a => `${a.getAttribute('href') || ''} ${a.getAttribute('onclick') || ''}`)
      .filter(x => /grdIndividualResultsChangePage/i.test(x)));

    const pagingValues = new Set();
    const decoded = String(html).replace(/&amp;/gi, '&').replace(/%3D/gi, '=');
    for (const source of [...rawPaging, decoded]) {
      let m;
      const re = /grdIndividualResultsChangePage[^'"\s)]*[=,']+(\d+_\d+)/gi;
      while ((m = re.exec(source))) pagingValues.add(m[1]);
    }

    // Also try the common GridView URL forms. This avoids relying on a
    // particular ASP.NET rendering of the pager.
    const base = new URL(firstUrl);
    for (const size of [50, 20, 10]) {
      for (let i = 0; i < pageCount; i += 1) {
        for (const n of [i, i + 1]) {
          const u = new URL(base);
          u.searchParams.set('ctl00_cphMain_grdIndividualResultsChangePage', `${n}_${size}`);
          if (!visited.has(u.href)) {
            urls.add(u.href);
            queue.push(u.href);
          }
        }
      }
    }

    for (const value of pagingValues) {
      const u = new URL(base);
      u.searchParams.set('ctl00_cphMain_grdIndividualResultsChangePage', value);
      if (!visited.has(u.href)) {
        urls.add(u.href);
        queue.push(u.href);
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
  let metadata = null;
  const allResults = [];
  const resultFiles = new Set();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(500);

  let lastSignature = '';
  let nextPageNumber = 2;

  for (let safety = 0; safety < 30; safety += 1) {
    const data = await page.evaluate(() => {
      const cleanText = value => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const text = document.body?.innerText || '';
      const title = cleanText(document.querySelector('h1')?.textContent || document.title || '');

      const leafText = [...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0)
        .map(el => cleanText(el.textContent))
        .filter(Boolean);

      const labelValue = label => {
        const idx = leafText.findIndex(x => x.toLowerCase() === label.toLowerCase());
        return idx >= 0 ? leafText[idx + 1] || '' : '';
      };

      // Only read rows/cells belonging directly to each table. The Endurance
      // Telerik grid contains nested tables; querySelectorAll('tr') on the
      // outer table recursively collects thousands of nested filter/dropdown
      // rows and can balloon memory into hundreds of thousands of records.
      const tables = [...document.querySelectorAll('table')].map(table => {
        const rowNodes = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')];
        return rowNodes
          .map(tr => [...tr.querySelectorAll(':scope > th, :scope > td')]
            .map(td => cleanText(td.textContent)))
          .filter(r => r.length);
      });

      const resultFileLinks = [...document.querySelectorAll('a[href]')]
        .map(a => ({ href: a.href, text: cleanText(a.textContent) }))
        .filter(x => /\.(txt|pdf)(\?|$)/i.test(x.href));

      const pagerControls = [...document.querySelectorAll(
        'a[href], input[type="submit"], input[type="button"], input[type="image"], button'
      )].map((el, index) => ({
        index,
        text: cleanText(el.textContent || el.value || ''),
        href: el.getAttribute('href') || '',
        onclick: el.getAttribute('onclick') || '',
        disabled: !!el.disabled,
        aria: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        alt: el.getAttribute('alt') || '',
        src: el.getAttribute('src') || '',
        cls: String(el.className || '')
      })).filter(x =>
        /grdIndividualResults/i.test(`${x.href} ${x.onclick}`) ||
        /__doPostBack/i.test(`${x.href} ${x.onclick}`) ||
        /next|forward|right/i.test(`${x.text} ${x.aria} ${x.title} ${x.alt} ${x.src} ${x.cls}`)
      );

      const pageInfo = text.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);

      return {
        title,
        bodyText: text,
        raceType: labelValue('Race Type'),
        raceDate: labelValue('Race Date'),
        location: labelValue('Race Location'),
        description: labelValue('Race Description'),
        tables,
        resultFileLinks,
        pagerControls,
        pageInfo: pageInfo ? { items: Number(pageInfo[1]), pages: Number(pageInfo[2]) } : null
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
      const u = absoluteUrl(link.href);
      if (u && /\.txt(\?|$)/i.test(u)) resultFiles.add(u);
    }

    let pageRows = 0;
    for (const rows of data.tables || []) {
      if (!rows.length) continue;

      // Some pages have a filter/control row before the actual grid header.
      // Find the first row that really contains the result columns.
      let headerIndex = -1;
      let map = null;
      for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
        const candidate = headerMap(rows[i]);
        const hasName = candidate.firstname !== undefined || candidate.lastname !== undefined || candidate.name !== undefined;
        const hasTime = candidate.totaltime !== undefined || candidate.time !== undefined || candidate.resulttime !== undefined;
        if (hasName && hasTime) {
          headerIndex = i;
          map = candidate;
          break;
        }
      }
      if (headerIndex < 0 || !map) continue;

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

        // Ignore grid controls/labels that happen to line up with the
        // result columns. Real result rows have at least a name and a bib,
        // place, or parseable time.
        const parsedPlace = Number.parseInt(place, 10) || null;
        const parsedTime = timeToSeconds(totalTime);
        const parsedBib = clean(bib) || null;
        if (!first && !last) continue;
        if (!parsedTime && !parsedPlace && !parsedBib) continue;

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
          bib: parsedBib,
          place: parsedPlace,
          time: clean(totalTime) || null,
          timeSeconds: parsedTime,
          sourceAthleteId: resultsKey || null,
        });
        pageRows += 1;
      }
    }

    const signature = allResults.slice(-Math.min(pageRows, 5))
      .map(r => `${r.sourceAthleteId}|${r.firstName}|${r.lastName}|${r.time}`)
      .join('||');

    if (signature && signature === lastSignature) break;
    if (signature) lastSignature = signature;

    const pageCount = Math.min(Math.max(data.pageInfo?.pages || 1, 1), 30);
    if (safety >= pageCount - 1) break;

    let target = (data.pagerControls || []).find(c =>
      !c.disabled && Number(c.text) === nextPageNumber
    );

    if (!target) {
      target = (data.pagerControls || []).find(c =>
        !c.disabled &&
        /next|forward|right/i.test(`${c.text} ${c.aria} ${c.title} ${c.alt} ${c.src} ${c.cls}`)
      );
    }

    if (!target) break;

    const locator = page.locator(
      'a, input[type="submit"], input[type="button"], input[type="image"], button'
    ).nth(target.index);

    try {
      await locator.click({ timeout: Math.min(timeout, 10000) });
      await page.waitForTimeout(700);
      nextPageNumber += 1;
    } catch {
      break;
    }
  }

  // Many current Nordic pages have an empty HTML grid, but link the actual
  // result sets as .TXT files. Read those files directly.
  for (const fileUrl of resultFiles) {
    try {
      const text = await fetchTextResult(page, fileUrl, timeout);
      const parsed = parseTextResult(text);
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
      r.sourceAthleteId || '',
      r.bib || '',
      r.firstName,
      r.lastName,
      r.time || '',
      r.place || '',
      r.team || '',
      r.class || '',
      r.field || ''
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
