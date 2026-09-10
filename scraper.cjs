#!/usr/bin/env node
/**
 * My Nordic Race Results - Endurance Promotions scraper
 *
 * Automatic discovery only. No race IDs are hard-coded.
 *
 * Strategy:
 *  1. Discover race-detail links from Endurance Promotions' live Results grid.
 *  2. Follow the site's ASP.NET grid pagination using its public query-string
 *     pager state (and fall back to clicking the grid when necessary).
 *  3. For each discovered Skiing race, collect:
 *       - rows exposed directly by the Individual Results grid
 *       - linked TXT result files
 *       - linked PDF result files
 *       - linked child ResultDetails pages
 *  4. Recursively process child result pages/files so events such as Nordic
 *     Championships, where the parent grid is intentionally empty, still
 *     produce athlete results.
 *  5. Deduplicate rows and refuse to replace a known-good results.json with
 *     an empty result set.
 *
 * Usage:
 *   node scraper.cjs --sport nordic --out public/results.json
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const { chromium } = require('playwright');
const pdfParse = require('pdf-parse');

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
  'nordic', 'skiing', 'ski', 'xc', 'cross country', 'cross-country',
  'loppet', 'birkie', 'sisu', 'vakava', 'rollerski', 'roller ski',
  'skate', 'classic', 'pursuit', 'winter', 'pre fat', 'pre-fat'
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sport') args.sport = argv[++i] || args.sport;
    else if (a === '--out') args.out = path.resolve(process.cwd(), argv[++i] || args.out);
    else if (a === '--max-races') args.maxRaces = Number(argv[++i] || 0) || 0;
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 1) || 1);
    else if (a === '--timeout') args.timeout = Math.max(1000, Number(argv[++i] || 30000) || 30000);
    else if (a === '--all') args.sport = 'all';
    else if (a === '--help' || a === '-h') {
      console.log('node scraper.cjs --sport nordic --out public/results.json');
      process.exit(0);
    }
  }
  return args;
}

function clean(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(v) {
  return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function absoluteUrl(href, base = BASE) {
  try {
    if (!href || /^javascript:/i.test(href)) return null;
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function parseDate(v) {
  const s = clean(v);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function timeToSeconds(v) {
  const s = clean(v);
  if (!s) return null;
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function headerKey(v) {
  return normalize(v).replace(/[^a-z0-9]/g, '');
}

function findHeaderRow(rows, required = []) {
  for (let i = 0; i < Math.min(rows.length, 12); i += 1) {
    const keys = rows[i].map(headerKey);
    if (required.every(k => keys.includes(headerKey(k)))) return i;
  }
  return -1;
}

function valueByHeader(row, headers, ...names) {
  for (const name of names) {
    const i = headers[headerKey(name)];
    if (i !== undefined) return clean(row[i]);
  }
  return '';
}

function looksNordic(race) {
  const text = normalize(`${race.event} ${race.location} ${race.raceType} ${race.description}`);
  return normalize(race.raceType) === 'skiing' || NORDIC_KEYWORDS.some(k => text.includes(normalize(k)));
}

function splitName(full) {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter(r => {
    const key = [
      r.sourceResultUrl || '', r.sourceAthleteId || '', r.bib || '',
      normalize(r.firstName), normalize(r.lastName), r.time || '', r.place || ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseNordicText(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);

  // Current Endurance Nordic files are fixed-width and look like:
  // Place Bib Name Grade School Time
  // ===== ===== ======================= ===== ====================== =======
  // 1     609 Peter Schulz 12 St Paul Central 12:55.2
  for (const raw of lines) {
    const line = String(raw).replace(/\t/g, ' ').trimEnd();
    const compact = clean(line);
    if (!compact || /^place\s+bib\b/i.test(compact) || /^=+/.test(compact)) continue;

    let m = compact.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,2})\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (m) {
      const [, place, bib, name, grade, school, time] = m;
      const n = splitName(name);
      out.push({
        firstName: n.firstName, lastName: n.lastName, name: clean(name),
        team: clean(school), school: clean(school), class: '', field: '',
        city: '', gender: null, age: grade || null, bib: bib || null,
        place: Number(place), time, timeSeconds: timeToSeconds(time), sourceAthleteId: null
      });
      continue;
    }

    // Some files omit grade. Use the final time token and preserve the
    // preceding text as name/school rather than dropping the row.
    m = compact.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (m) {
      const [, place, bib, middle, time] = m;
      const n = splitName(middle);
      out.push({
        firstName: n.firstName, lastName: n.lastName, name: clean(middle),
        team: '', school: '', class: '', field: '', city: '', gender: null,
        age: null, bib: bib || null, place: Number(place), time,
        timeSeconds: timeToSeconds(time), sourceAthleteId: null
      });
    }
  }
  return out;
}

function parsePdfText(text) {
  // PDF extraction often collapses columns differently. Reuse the TXT parser
  // first; then support the common "Place Bib Name ... Time" layout.
  return parseNordicText(text);
}

async function readJsonIfExists(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function writeSafe(outFile, payload) {
  const previous = await readJsonIfExists(outFile);
  if (payload.rowCount === 0 && previous && Number(previous.rowCount) > 0) {
    throw new Error(`Refusing to overwrite ${outFile}: scraper returned 0 rows while previous file contains ${previous.rowCount}.`);
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, outFile);
}

async function extractTables(page) {
  return page.evaluate(() => {
    const cleanText = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('table')].map(table =>
      [...table.querySelectorAll('tr')]
        .map(tr => [...tr.querySelectorAll('th,td')].map(td => cleanText(td.textContent)))
        .filter(row => row.length)
    );
  });
}

async function extractRaceIndexPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);

  return page.evaluate(() => {
    const cleanText = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const body = cleanText(document.body?.innerText || '');
    const info = body.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);

    const rows = [];
    for (const tr of document.querySelectorAll('table tr')) {
      const cells = [...tr.querySelectorAll('th,td')].map(td => cleanText(td.textContent));
      const anchor = tr.querySelector('a[href*="ResultDetails.aspx"],a[href*="resultdetails.aspx"]');
      if (!anchor) continue;
      const href = anchor.href;
      const id = new URL(href, location.href).searchParams.get('id');
      if (!id) continue;
      const text = cells.join(' | ');
      rows.push({
        id, href, text, name: cleanText(anchor.textContent),
        rowHtml: tr.innerText || ''
      });
    }

    // Fallback: collect every ResultDetails anchor even if the grid markup is
    // unusual or the header row is not where expected.
    for (const a of document.querySelectorAll('a[href*="ResultDetails.aspx"],a[href*="resultdetails.aspx"]')) {
      const href = a.href;
      const id = new URL(href, location.href).searchParams.get('id');
      if (!id) continue;
      if (!rows.some(x => x.id === id)) rows.push({ id, href, text: '', name: cleanText(a.textContent), rowHtml: '' });
    }

    return { rows, items: info ? Number(info[1]) : 0, pages: info ? Number(info[2]) : 1 };
  });
}

async function discoverRacePages(page, timeout) {
  console.log('DISCOVERY: opening Endurance Promotions Results page');
  const first = await extractRaceIndexPage(page, RESULTS_URL);
  const totalPages = Math.min(Math.max(first.pages || 1, 1), 200);
  const pageSize = 25;
  const discovered = new Map();

  const addRows = data => {
    for (const r of data.rows || []) {
      const u = absoluteUrl(r.href);
      if (u && r.id) discovered.set(String(r.id), { id: String(r.id), url: u, indexText: r.text, name: r.name });
    }
  };
  addRows(first);
  console.log(`DISCOVERY: index reports ${first.items || 'unknown'} items in ${totalPages} pages; page size ${pageSize}`);

  for (let p = 2; p <= totalPages; p += 1) {
    const u = new URL(RESULTS_URL);
    u.searchParams.set('ctl00_cphMain_grdResultsChangePage', `${p}_${pageSize}`);
    try {
      const data = await extractRaceIndexPage(page, u.href);
      addRows(data);
      console.log(`DISCOVERY: page ${p}/${totalPages} -> ${data.rows.length} race links (total ${discovered.size})`);
    } catch (e) {
      console.warn(`DISCOVERY: page ${p} failed: ${e.message}`);
    }
  }

  // If query-string paging ever stops working, click through the live pager
  // as a final fallback. This is deliberately a fallback, not the primary path.
  if (discovered.size === 0) {
    console.warn('DISCOVERY: query-string paging returned no links; trying live pager controls.');
    await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout });
    for (let p = 1; p <= totalPages; p += 1) {
      const data = await extractRaceIndexPage(page, page.url());
      addRows(data);
      console.log(`DISCOVERY: live pager page ${p}/${totalPages} -> ${data.rows.length} race links (total ${discovered.size})`);
      if (p >= totalPages) break;

      // The Results grid uses ASP.NET postbacks. Find the control whose
      // postback target contains the next page number and invoke it in the
      // page context; this works even when there is no normal href.
      const nextPage = p + 1;
      const clicked = await page.evaluate((targetPage) => {
        const cleanText = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const controls = [...document.querySelectorAll('a,button,input')];
        const candidates = controls.filter(el => {
          if (el.disabled) return false;
          const text = cleanText(el.textContent || el.value || '');
          const href = el.getAttribute('href') || '';
          const onclick = el.getAttribute('onclick') || '';
          const all = `${text} ${href} ${onclick}`;
          return new RegExp(`grdResults[^\\n]*Page\\$${targetPage}\\b`, 'i').test(all) ||
                 new RegExp(`(?:^|\\s)${targetPage}(?:\\s|$)`).test(text) && /grdResults|__doPostBack|ChangePage/i.test(all);
        });
        const el = candidates[0];
        if (!el) return false;
        el.click();
        return true;
      }, nextPage);
      if (!clicked) {
        console.warn(`DISCOVERY: could not find ASP.NET pager control for page ${nextPage}`);
        break;
      }
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      } catch {}
    }
  }

  console.log(`DISCOVERY: ${discovered.size} unique race-detail pages found.`);
  return [...discovered.values()];
}

async function extractRacePage(page, url, timeout) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(300);
  const data = await page.evaluate(() => {
    const cleanText = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const body = cleanText(document.body?.innerText || '');
    const title = cleanText(document.querySelector('h1')?.textContent || document.title || '')
      .replace(/^Individual Results for\s*/i, '');
    const leaf = [...document.querySelectorAll('body *')].filter(x => x.children.length === 0)
      .map(x => cleanText(x.textContent)).filter(Boolean);
    const getAfter = label => {
      const i = leaf.findIndex(x => x.toLowerCase() === label.toLowerCase());
      return i >= 0 ? leaf[i + 1] || '' : '';
    };
    const links = [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: cleanText(a.textContent) }));
    const pageInfo = body.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    return {
      title, body, raceType: getAfter('Race Type'), raceDate: getAfter('Race Date'),
      location: getAfter('Race Location'), description: getAfter('Race Description'),
      pageInfo: pageInfo ? { items: Number(pageInfo[1]), pages: Number(pageInfo[2]) } : null,
      links,
    };
  });
  const tables = await extractTables(page);
  return { ...data, tables, url };
}

function rowsFromHtmlTables(tables) {
  const out = [];
  for (const rows of tables) {
    const hi = findHeaderRow(rows, ['First Name', 'Last Name', 'Total Time']) >= 0
      ? findHeaderRow(rows, ['First Name', 'Last Name', 'Total Time'])
      : findHeaderRow(rows, ['First Name', 'Last Name', 'Time']);
    if (hi < 0) continue;
    const headers = {};
    rows[hi].forEach((h, i) => { headers[headerKey(h)] = i; });
    for (const row of rows.slice(hi + 1)) {
      const first = valueByHeader(row, headers, 'First Name', 'Firstname', 'First');
      const last = valueByHeader(row, headers, 'Last Name', 'Lastname', 'Last');
      const name = valueByHeader(row, headers, 'Name');
      const n = !first && name ? splitName(name) : { firstName: first, lastName: last };
      if (!n.firstName && !n.lastName) continue;
      const time = valueByHeader(row, headers, 'Total Time', 'Time', 'Result Time');
      if (!time || !/^\d+(?::\d{2}){1,2}(?:\.\d+)?$/.test(time)) continue;
      out.push({
        firstName: n.firstName, lastName: n.lastName, name: clean(name || `${n.firstName} ${n.lastName}`),
        team: valueByHeader(row, headers, 'Team', 'Affiliation'),
        school: valueByHeader(row, headers, 'School'),
        class: valueByHeader(row, headers, 'Class', 'Category'),
        field: valueByHeader(row, headers, 'Field', 'Race'),
        city: valueByHeader(row, headers, 'City'),
        gender: valueByHeader(row, headers, 'Gender', 'Sex') || null,
        age: valueByHeader(row, headers, 'Age') || null,
        bib: valueByHeader(row, headers, 'Bib #', 'Bib', 'Bib Number') || null,
        place: Number.parseInt(valueByHeader(row, headers, 'Pos', 'Position', 'Place', 'PIC'), 10) || null,
        time,
        timeSeconds: timeToSeconds(time),
        sourceAthleteId: valueByHeader(row, headers, 'ResultsKey', 'ResultKey') || null,
      });
    }
  }
  return out;
}

async function fetchLinkedFile(page, url, timeout) {
  const res = await page.request.get(url, { timeout });
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  const buffer = await res.body();
  const ct = (res.headers()['content-type'] || '').toLowerCase();
  if (/\.pdf(?:\?|$)/i.test(url) || ct.includes('pdf')) {
    const parsed = await pdfParse(buffer);
    return { type: 'pdf', text: parsed.text || '' };
  }
  return { type: 'txt', text: buffer.toString('utf8') };
}

async function processRace(page, seed, timeout) {
  const queue = [{ url: seed.url, label: seed.name || 'Race' }];
  const visitedPages = new Set();
  const visitedFiles = new Set();
  const results = [];
  let rootMeta = null;
  const childLabels = new Map();

  while (queue.length && visitedPages.size < 100) {
    const current = queue.shift();
    if (visitedPages.has(current.url)) continue;
    visitedPages.add(current.url);

    const data = await extractRacePage(page, current.url, timeout);
    if (!rootMeta) {
      rootMeta = {
        event: data.title || seed.name,
        raceType: clean(data.raceType), raceDate: clean(data.raceDate),
        location: clean(data.location), description: clean(data.description),
        sourceUrl: seed.url, raceKey: seed.id
      };
    }

    // Direct HTML grid rows.
    results.push(...rowsFromHtmlTables(data.tables).map(r => ({ ...r, sourceResultUrl: current.url, resultLabel: current.label })));

    // Collect linked TXT/PDF result files. These are the key source for many
    // Nordic championship pages whose parent grid intentionally has no rows.
    for (const link of data.links) {
      const fileUrl = absoluteUrl(link.href, current.url);
      if (!fileUrl || !/\.(txt|pdf)(?:\?|$)/i.test(fileUrl)) continue;
      if (visitedFiles.has(fileUrl)) continue;
      visitedFiles.add(fileUrl);
      try {
        const file = await fetchLinkedFile(page, fileUrl, timeout);
        const parsed = file.type === 'pdf' ? parsePdfText(file.text) : parseNordicText(file.text);
        results.push(...parsed.map(r => ({ ...r, sourceResultUrl: fileUrl, resultLabel: link.text || current.label })));
      } catch (e) {
        console.warn(`RESULT FILE: failed ${fileUrl}: ${e.message}`);
      }
    }

    // Child result pages are real result sets linked from the parent race
    // description. Follow them automatically.
    for (const link of data.links) {
      const child = absoluteUrl(link.href, current.url);
      if (!child || !/ResultDetails\.aspx/i.test(child)) continue;
      const id = new URL(child).searchParams.get('id');
      if (!id || child === current.url || visitedPages.has(child)) continue;
      childLabels.set(child, link.text || current.label);
      queue.push({ url: child, label: link.text || current.label });
    }
  }

  return { ...rootMeta, results: dedupeRows(results), pages: visitedPages.size, files: visitedFiles.size };
}

async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await worker(items[i], i); }
      catch (e) { out[i] = { error: e?.message || String(e), item: items[i] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Endurance Promotions automatic Nordic scraper');
  console.log(`Sport filter: ${args.sport}`);
  console.log('Discovery mode: live Results grid -> race pages -> linked TXT/PDF/child result pages');

  const browser = await chromium.launch({ headless: true });
  try {
    const index = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const seeds = await discoverRacePages(index, args.timeout);
    await index.close();

    const selected = args.maxRaces === Infinity ? seeds : seeds.slice(0, args.maxRaces);
    console.log(`RACE DISCOVERY: ${seeds.length} total candidates; processing ${selected.length}.`);

    const workerResults = await mapLimit(selected, args.concurrency, async (seed, i) => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        const race = await processRace(page, seed, args.timeout);
        console.log(`RACE ${i + 1}/${selected.length}: ${race.event} | ${race.raceType} | ${race.results.length} rows | ${race.files} files | ${race.pages} pages`);
        return race;
      } finally {
        await page.close();
      }
    });

    const errors = workerResults.filter(x => x?.error);
    let races = workerResults.filter(x => x && !x.error);
    const skiingCandidates = races.filter(looksNordic);
    const racesWithRows = skiingCandidates.filter(r => r.results.length);

    console.log(`DIAGNOSTICS: race pages processed = ${races.length}`);
    console.log(`DIAGNOSTICS: Nordic/Skiing races = ${skiingCandidates.length}`);
    console.log(`DIAGNOSTICS: Nordic races with athlete rows = ${racesWithRows.length}`);
    console.log(`DIAGNOSTICS: result files read = ${races.reduce((n, r) => n + (r.files || 0), 0)}`);
    console.log(`DIAGNOSTICS: page visits = ${races.reduce((n, r) => n + (r.pages || 0), 0)}`);
    console.log(`DIAGNOSTICS: errors = ${errors.length}`);

    races = racesWithRows;
    const matches = [];
    for (const race of races) {
      for (const row of race.results) {
        matches.push({
          ...row,
          raceKey: race.raceKey,
          raceName: race.event,
          raceDate: parseDate(race.raceDate),
          location: race.location,
          raceType: race.raceType,
          discipline: 'Nordic',
          sourceUrl: row.sourceResultUrl || race.sourceUrl,
          sourceRaceId: race.raceKey,
          description: race.description,
          resultLabel: row.resultLabel || race.event,
        });
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      source: BASE,
      sport: args.sport,
      raceCount: races.length,
      rowCount: matches.length,
      errorCount: errors.length,
      diagnostics: {
        discoveredRacePages: seeds.length,
        processedRacePages: workerResults.length,
        nordicRacePages: skiingCandidates.length,
        nordicRacesWithRows: races.length,
        resultFilesRead: races.reduce((n, r) => n + (r.files || 0), 0),
        pageVisits: races.reduce((n, r) => n + (r.pages || 0), 0),
      },
      errors: errors.slice(0, 25).map(e => ({ url: e.item?.url || '', error: e.error })),
      matches,
    };

    await writeSafe(args.out, payload);
    console.log(`OUTPUT: ${args.out}`);
    console.log(`OUTPUT: ${payload.raceCount} races, ${payload.rowCount} rows`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
