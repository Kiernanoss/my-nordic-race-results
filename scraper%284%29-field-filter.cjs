#!/usr/bin/env node

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const pdfParse = require('pdf-parse');
const { chromium } = require('playwright');

const BASE = 'https://www.endurancepromotions.com';

const DEFAULTS = {
  sport: 'nordic',

  out: path.resolve(
    process.cwd(),
    'public',
    'results.json'
  ),

  // Keep this low to reduce simultaneous memory use.
  concurrency: 4,

  timeout: 20000,

  // IMPORTANT:
  // Your first Nordic race is RaceKey 1723.
  startId: 1723,

  // Keep this configurable.
  maxId: 3000,

  // Discovery requests happen in blocks.
  blockSize: 250,

  // Stop after several completely empty blocks.
  emptyBlocks: 8,

  // Process races in small batches.
  batchSize: 10
};

const NORDIC_KEYWORDS = [
  'nordic',
  'skiing',
  'cross country skiing',
  'cross-country skiing',
  'cross country ski',
  'cross-country ski',
  'xc skiing',
  'xc ski',
  'rollerski',
  'roller ski',
  'roller skiing',
  'loppet',
  'birkie',
  'sisu',
  'vakava'
];

function args(a) {
  const o = { ...DEFAULTS };

  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--sport') {
      o.sport = a[++i] || o.sport;

    } else if (a[i] === '--out') {
      o.out = path.resolve(
        process.cwd(),
        a[++i] || o.out
      );

    } else if (a[i] === '--concurrency') {
      o.concurrency = Math.max(
        1,
        Number(a[++i]) || DEFAULTS.concurrency
      );

    } else if (a[i] === '--timeout') {
      o.timeout = Math.max(
        1000,
        Number(a[++i]) || DEFAULTS.timeout
      );

    } else if (a[i] === '--start-id') {
      o.startId = Math.max(
        1,
        Number(a[++i]) || DEFAULTS.startId
      );

    } else if (a[i] === '--max-id') {
      o.maxId = Math.max(
        1,
        Number(a[++i]) || DEFAULTS.maxId
      );

    } else if (a[i] === '--batch-size') {
      o.batchSize = Math.max(
        1,
        Number(a[++i]) || DEFAULTS.batchSize
      );

    } else if (
      a[i] === '--help' ||
      a[i] === '-h'
    ) {
      console.log(`
Endurance Promotions Nordic scraper

Usage:

node scraper.cjs --sport nordic --out public/results.json

Options:

--start-id 1723
--max-id 3000
--batch-size 10
--concurrency 4
--timeout 20000
`);

      process.exit(0);
    }
  }

  if (o.maxId < o.startId) {
    throw new Error(
      `max-id (${o.maxId}) must be greater than or equal to start-id (${o.startId}).`
    );
  }

  return o;
}

function clean(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(v) {
  return clean(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function abs(u, b = BASE) {
  try {
    return new URL(u, b).href;
  } catch {
    return null;
  }
}

function decode(s) {
  return clean(
    String(s || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(
        /&#(\d+);/g,
        (_, n) => String.fromCharCode(Number(n))
      )
  );
}

function strip(s) {
  return decode(
    String(s || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function timeSec(v) {
  const p = clean(v)
    .split(':')
    .map(Number);

  if (
    !p.length ||
    p.some(Number.isNaN)
  ) {
    return null;
  }

  if (p.length === 2) {
    return p[0] * 60 + p[1];
  }

  if (p.length === 3) {
    return (
      p[0] * 3600 +
      p[1] * 60 +
      p[2]
    );
  }

  return null;
}

function splitName(n) {
  const p = clean(n)
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: p.shift() || '',
    lastName: p.join(' ')
  };
}

function headerKey(v) {
  return norm(v)
    .replace(/[^a-z0-9]/g, '');
}

/*
 * IMPORTANT:
 *
 * We do NOT use the old broad "ski" keyword.
 *
 * A cycling race such as:
 *
 * 2015 Bayport Belgian CX
 *
 * must not be classified as Nordic merely because
 * something in its text happens to contain "ski".
 */
function looksNordic(r) {
  const raceType = norm(r.raceType);

  const text = norm(
    `${r.event} ${r.location} ${r.description}`
  );

  // Strongest possible signal.
  if (raceType === 'skiing') {
    return true;
  }

  // Strong Nordic-specific phrases.
  if (
    NORDIC_KEYWORDS.some(k =>
      text.includes(norm(k))
    )
  ) {
    return true;
  }

  // "classic" and "pursuit" only count when
  // the surrounding race information also mentions skiing.
  if (
    text.includes('classic') &&
    (
      text.includes('ski') ||
      text.includes('cross country') ||
      text.includes('nordic')
    )
  ) {
    return true;
  }

  if (
    text.includes('pursuit') &&
    (
      text.includes('ski') ||
      text.includes('cross country') ||
      text.includes('nordic')
    )
  ) {
    return true;
  }

  return false;
}

function parseTables(html) {
  const tables = [];

  for (
    const tm of String(html).matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi
    )
  ) {
    const rows = [];

    for (
      const rm of tm[1].matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ) {
      const cells = [
        ...rm[1].matchAll(
          /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
        )
      ].map(m => strip(m[1]));

      if (cells.length) {
        rows.push(cells);
      }
    }

    if (rows.length) {
      tables.push(rows);
    }
  }

  return tables;
}

function parseLinks(html) {
  const out = [];

  for (
    const m of String(html).matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )
  ) {
    const href = abs(m[1]);

    if (href) {
      out.push({
        href,
        text: strip(m[2])
      });
    }
  }

  return out;
}

function findResultHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const ks = rows[i].map(headerKey);
    const hasNames = ks.includes('firstname') && ks.includes('lastname');
    const hasTime = ks.includes('totaltime') || ks.includes('time');
    if (hasNames && hasTime) return i;
  }
  return -1;
}

function inferGender(field, className) {
  const value = norm(`${field} ${className}`);
  if (/\b(girls?|female|women|woman|womens?)\b/.test(value) || /^g/.test(norm(field))) return 'F';
  if (/\b(boys?|male|men|mens?)\b/.test(value) || /^b/.test(norm(field))) return 'M';
  return '';
}

function rowsFromTable(rows) {
  const hi = findResultHeader(rows);

  if (hi < 0) {
    return [];
  }

  const h = {};

  rows[hi].forEach(
    (v, i) => {
      h[headerKey(v)] = i;
    }
  );

  const get = (
    r,
    ...names
  ) => {
    for (
      const n of names
    ) {
      const i =
        h[headerKey(n)];

      if (
        i !== undefined
      ) {
        return clean(r[i]);
      }
    }

    return '';
  };

  const out = [];

  for (
    const r of rows.slice(
      hi + 1
    )
  ) {
    const first =
      get(r, 'First Name');

    const last =
      get(r, 'Last Name');

    const time =
      get(
        r,
        'Total Time',
        'Time'
      );

    if (
      (!first && !last) ||
      !time
    ) {
      continue;
    }

    const place =
      get(
        r,
        'Pos',
        'Place'
      );

    const bib =
      get(
        r,
        'Bib #',
        'Bib'
      );

    const field = get(r, 'Field');
    const className = get(r, 'Class');
    const gender = get(r, 'Gender') || inferGender(field, className) || null;

    out.push({
      firstName: first,
      lastName: last,

      name: clean(
        `${first} ${last}`
      ),

      team:
        get(
          r,
          'Team',
          'School'
        ),

      school:
        get(
          r,
          'School',
          'Team'
        ),

      class:
        className,

      field:
        field,

      city:
        get(r, 'City'),

      gender,

      age:
        get(r, 'Age') ||
        null,

      bib:
        bib || null,

      place:
        Number(place) || null,

      time,

      timeSeconds:
        timeSec(time),

      sourceAthleteId:
        get(
          r,
          'ResultsKey'
        ) || null
    });
  }

  return out;
}

function parseText(text, genderHint = null, fieldHint = null) {
  const out = [];
  const hintedGender = genderHint ? String(genderHint).toUpperCase() : null;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const s = clean(raw);
    if (!s || /^place\s+bib/i.test(s) || /^=+/.test(s)) continue;

    // PDF race files commonly have:
    // Place | Bib | Name | Grade | School | Time
    // The grade gives us a reliable boundary between athlete name and school.
    let m = s.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,2})\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (m) {
      const n = splitName(m[3]);
      out.push({
        firstName: n.firstName,
        lastName: n.lastName,
        name: `${n.firstName} ${n.lastName}`,
        team: m[5], school: m[5], class: fieldHint || '', field: fieldHint || '', city: '',
        gender: hintedGender,
        age: m[4], bib: m[2], place: Number(m[1]), time: m[6],
        timeSeconds: timeSec(m[6]), sourceAthleteId: null
      });
      continue;
    }

    // Common Endurance Promotions text export:
    // 1 107 Lila Golomb 14:59.0
    m = s.match(/^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (m) {
      const n = splitName(m[3]);
      out.push({
        firstName: n.firstName,
        lastName: n.lastName,
        name: `${n.firstName} ${n.lastName}`,
        team: '', school: '', class: fieldHint || '', field: fieldHint || '', city: '',
        gender: hintedGender, age: null, bib: m[2], place: Number(m[1]), time: m[4],
        timeSeconds: timeSec(m[4]), sourceAthleteId: null
      });
    }
  }

  return out;
}

function inferGenderFromText(text) {
  const value = norm(text);
  if (/\bgirls?\b|\bfemale\b|\bwomen\b|\bwomens\b/.test(value)) return 'F';
  if (/\bboys?\b|\bmale\b|\bmen\b|\bmens\b/.test(value)) return 'M';
  return null;
}

function inferFieldFromText(text) {
  const value = clean(text);
  const m = value.match(/(?:FIELD|CLASS)\s*[:\-]\s*([A-Za-z0-9_ -]+)/i);
  return clean(m?.[1] || '');
}

/*
 * Extract race metadata from the page.
 *
 * We deliberately use whitespace-flexible regexes because
 * Endurance Promotions sometimes renders the metadata on
 * one line and sometimes with different HTML spacing.
 */
function raceMeta(html, id) {
  const text = clean(strip(String(html || '')));

  const between = (startLabel, endLabel) => {
    const start = text.toLowerCase().indexOf(startLabel.toLowerCase());
    if (start < 0) return '';

    const valueStart = start + startLabel.length;
    const end = endLabel
      ? text.toLowerCase().indexOf(endLabel.toLowerCase(), valueStart)
      : -1;

    return clean(text.slice(valueStart, end >= 0 ? end : undefined));
  };

  // Endurance Promotions renders these fields without reliable pipe/table
  // separators, so extract them by their visible labels instead of assuming
  // "|" characters exist.
  const title = (() => {
    const m = text.match(
      /Individual Results for\s+(.+?)(?=\s+Race Details\b|\s+Race Type\b|$)/i
    );
    return clean(m?.[1] || '');
  })();

  const raceType = between('Race Type', 'Race Date');
  const date = between('Race Date', 'Race Location');
  const location = between('Race Location', 'Race Description');
  const description = between('Race Description', 'Filter by Field:');

  return {
    id: String(id),
    event: title,
    raceType,
    date,
    location,
    description,
  };
}

async function fetchText(
  url,
  timeout = DEFAULTS.timeout,
  attempt = 0
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)'
          }
        }
      );

    if (!response.ok) {
      return {
        status:
          response.status,

        url,

        body: ''
      };
    }

    return {
      status:
        response.status,

      url,

      body:
        await response.text()
    };

  } catch (e) {
    if (attempt < 2) {
      return fetchText(
        url,
        timeout,
        attempt + 1
      );
    }

    return {
      status: 0,

      url,

      body: '',

      error:
        e.message
    };

  } finally {
    clearTimeout(
      timer
    );
  }
}

async function mapLimit(
  items,
  limit,
  fn
) {
  const out =
    new Array(
      items.length
    );

  let next = 0;

  async function worker() {
    while (true) {
      const i =
        next++;

      if (
        i >= items.length
      ) {
        return;
      }

      out[i] =
        await fn(
          items[i],
          i
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          )
      },
      worker
    )
  );

  return out;
}

/*
 * DISCOVER RACES
 *
 * Starts at RaceKey 1723 by default.
 *
 * This means we no longer waste time probing
 * RaceKeys 1-1722.
 */
async function discoverByIds(a) {
  console.log(
    `DISCOVERY: starting at RaceKey ${a.startId}`
  );

  console.log(
    `DISCOVERY: scanning through RaceKey ${a.maxId}`
  );

  console.log(
    'DISCOVERY: only race metadata is retained.'
  );

  let start =
    a.startId;

  let empty =
    0;

  const found =
    new Map();

  while (
    start <= a.maxId &&
    empty < a.emptyBlocks
  ) {
    const end =
      Math.min(
        start +
          a.blockSize -
          1,
        a.maxId
      );

    const ids = [];

    for (
      let id = start;
      id <= end;
      id++
    ) {
      ids.push(id);
    }

    const results =
      await mapLimit(
        ids,
        a.concurrency,
        async id => {
          const url =
            `${BASE}/ResultDetails.aspx?id=${id}`;

          const response =
            await fetchText(
              url,
              a.timeout
            );

          if (
            response.status !== 200 ||
            !response.body
          ) {
            return null;
          }

          const race =
            raceMeta(
              response.body,
              id
            );

          /*
           * A real ResultDetails page should have
           * an event name or race type.
           */
          if (
            !race.event &&
            !race.raceType
          ) {
            return null;
          }

          return {
            ...race,

            url
          };
        }
      );

    const hits =
      results.filter(Boolean);

    for (
      const race of hits
    ) {
      found.set(
        race.id,
        race
      );
    }

    console.log(
      `DISCOVERY: ${start}-${end}: ${hits.length} valid pages (total ${found.size})`
    );

    if (
      hits.length === 0
    ) {
      empty++;
    } else {
      empty = 0;
    }

    start =
      end + 1;
  }

  return [
    ...found.values()
  ];
}

function hiddenFormFields(html) {
  const fields = {};
  for (const m of String(html || '').matchAll(/<input\b[^>]*type\s*=\s*["']hidden["'][^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!name) continue;
    const value = tag.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    fields[name] = decode(value);
  }
  return fields;
}

function findPagerPostback(html, pageNo) {
  const wanted = `Page$${pageNo}`;
  for (const m of String(html || '').matchAll(/__doPostBack\(\s*\\?['"]([^'"]+)\\?['"]\s*,\s*\\?['"]([^'"]+)\\?['"]\s*\)/gi)) {
    if (m[2] === wanted || m[2].endsWith(wanted)) {
      return { target: m[1], argument: m[2] };
    }
  }
  return null;
}

function parseSelectTag(tag) {
  const name = tag.match(/\bname\s*=\s*['"]([^'"]+)['"]/i)?.[1] || '';
  const id = tag.match(/\bid\s*=\s*['"]([^'"]+)['"]/i)?.[1] || '';
  const onchange = tag.match(/\bonchange\s*=\s*['"]([^'"]+)['"]/i)?.[1] || '';
  const post = onchange.match(/__doPostBack\(\s*\\?['"]([^'"]+)\\?['"]\s*,\s*\\?['"]([^'"]*)\\?['"]\s*\)/i);
  const options = [];
  for (const m of tag.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = m[1] || '';
    const value = attrs.match(/\bvalue\s*=\s*['"]([^'"]*)['"]/i)?.[1] ?? '';
    const text = strip(m[2]);
    if (text) options.push({ value, text, selected: /\bselected(?:\s*=\s*['"]selected['"])?/i.test(attrs) });
  }
  return { name, id, target: post?.[1] || name, argument: post?.[2] || '', options };
}

function findFieldFilter(html) {
  const candidates = [];
  for (const m of String(html || '').matchAll(/<select\b[\s\S]*?<\/select>/gi)) {
    const select = parseSelectTag(m[0]);
    if (!select.name && !select.id) continue;
    const texts = select.options.map(o => norm(o.text));
    const values = select.options.map(o => norm(o.value));
    const hasPlaceholder = texts.some(t => t === 'select a field' || t === 'show all');
    const hasB = select.options.some(o => /^b(?:[a-z0-9_ -]*)$/i.test(o.text) || /^b/i.test(o.value));
    const hasG = select.options.some(o => /^g(?:[a-z0-9_ -]*)$/i.test(o.text) || /^g/i.test(o.value));
    const looksGendered = select.options.some(o => /\b(girls?|boys?|women|men|female|male)\b/i.test(o.text));
    if (hasPlaceholder && (hasB && hasG || looksGendered)) {
      const options = select.options.filter(o => {
        const t = norm(o.text);
        return t && t !== 'select a field' && t !== 'show all';
      });
      if (options.length) candidates.push({ ...select, options });
    }
  }
  return candidates[0] || null;
}

async function postFieldFilter(raceUrl, firstPageHtml, control, option, a) {
  const hidden = hiddenFormFields(firstPageHtml);
  hidden[control.name] = option.value;
  hidden.__EVENTTARGET = control.target || control.name;
  hidden.__EVENTARGUMENT = control.argument || '';

  const response = await fetch(raceUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': raceUrl,
    },
    body: new URLSearchParams(hidden),
  });

  if (!response.ok) return { body: '', method: 'POST', field: option };
  return { body: await response.text(), method: 'POST', field: option };
}

async function fetchGridPage(raceUrl, pageNo, firstPageHtml, a, selectedFieldValue = null) {
  if (pageNo === 1) {
    if (firstPageHtml) return { body: firstPageHtml, method: 'GET' };
    const first = await fetchText(raceUrl, a.timeout);
    return { body: first.body || '', method: 'GET' };
  }

  // Endurance Promotions uses ASP.NET GridView postbacks. Keep the selected
  // field value in the form when moving to page 2+; otherwise the server can
  // silently jump back to its default (usually the boys field).
  const hidden = hiddenFormFields(firstPageHtml);
  const fieldFilter = findFieldFilter(firstPageHtml);
  if (fieldFilter) {
    const selected = fieldFilter.options.find(o =>
      new RegExp(`<option\\b[^>]*value\\s*=\\s*["']${escapeRegExp(o.value)}["'][^>]*\\bselected(?:\\s*=\\s*["']selected["'])?`, 'i').test(firstPageHtml)
    );
    const selectedValue = selectedFieldValue || selected?.value || fieldFilter.options[0]?.value || '';
    hidden[fieldFilter.name] = selectedValue;
  }

  const pager = findPagerPostback(firstPageHtml, pageNo);
  hidden.__EVENTTARGET = pager?.target || 'ctl00$cphMain$grdIndividualResults';
  hidden.__EVENTARGUMENT = pager?.argument || `Page$${pageNo}`;
  hidden.ctl00_cphMain_grdIndividualResultsChangePage = `${pageNo}_50`;

  const response = await fetch(raceUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': raceUrl,
    },
    body: new URLSearchParams(hidden),
  });

  if (!response.ok) return { body: '', method: 'POST' };
  return { body: await response.text(), method: 'POST' };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * Process one race with a real browser.
 *
 * Endurance Promotions uses ASP.NET postbacks for its field filter and
 * GridView pagination. A normal fetch/POST implementation can discover the
 * first page but silently return the same/default field or an empty page.
 * Playwright lets the site execute its own postback JavaScript exactly as a
 * normal browser does.
 */
async function processRace(race, a, stats, browser) {
  if (!looksNordic(race)) return [];

  stats.nordic++;

  const all = [];
  const seen = new Set();
  const page = await browser.newPage();

  const addRows = (rows, sourceUrl) => {
    for (const row of rows) {
      if (!row || (!row.firstName && !row.lastName)) continue;
      const enriched = {
        ...row,
        event: race.event,
        raceDate: race.date,
        raceLocation: race.location,
        raceType: race.raceType,
        sourceRaceId: race.id,
        sourceRaceUrl: race.url,
        sourceResultUrl: sourceUrl || race.url,
      };
      const key = [
        norm(enriched.firstName), norm(enriched.lastName),
        norm(enriched.field), enriched.place || '', enriched.time || '',
        enriched.bib || '', enriched.gender || ''
      ].join('|');
      if (!seen.has(key)) {
        seen.add(key);
        all.push(enriched);
      }
    }
  };

  const parseCurrentPage = async (fieldGender = null) => {
    const html = await page.content();
    const tables = parseTables(html);
    let count = 0;
    for (const table of tables) {
      const rows = rowsFromTable(table);
      if (!rows.length) continue;
      if (fieldGender) {
        for (const row of rows) {
          if (!row.gender) row.gender = fieldGender;
        }
      }
      const before = all.length;
      addRows(rows, race.url);
      count += all.length - before;
    }
    return { html, count };
  };

  const waitForPostback = async () => {
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(a.timeout, 8000) });
    } catch {}
    await page.waitForTimeout(250);
  };

  const selectInfo = async () => page.locator('select').evaluateAll(selects => selects.map((el, index) => ({
    index,
    name: el.getAttribute('name') || '',
    id: el.id || '',
    options: [...el.options].map(o => ({ value: o.value, text: (o.textContent || '').trim() }))
  })));

  const findFieldSelect = async () => {
    const selects = await selectInfo();
    return selects.find(s => {
      const texts = s.options.map(o => o.text.toLowerCase());
      const hasB = texts.some(t => /^b(?:\b|[ _-])/.test(t));
      const hasG = texts.some(t => /^g(?:\b|[ _-])/.test(t));
      return hasB && hasG;
    }) || null;
  };

  const findPageSizeSelect = async () => {
    const selects = await selectInfo();
    return selects.find(s => {
      const values = s.options.map(o => o.text.trim());
      return values.includes('10') && values.includes('20') && values.includes('50');
    }) || null;
  };

  /*
   * Scrape the site's main result GridView exactly as it is presented.
   *
   * Important: the page's "Field" dropdown is NOT the same thing as the
   * GridView pager. The default grid already contains BJV/BVAR/GJV/GVAR
   * rows across its pages. Earlier versions tried to discover the pager
   * from raw HTML and stopped after page 1 when ASP.NET changed the markup.
   *
   * We therefore:
   *   1. set the grid to 50 rows when possible,
   *   2. parse only the largest result table (the actual GridView),
   *   3. locate the requested page number from the live DOM,
   *   4. trigger the real ASP.NET postback in the browser,
   *   5. verify that the result rows changed before continuing.
   *
   * This captures boys and girls without hard-coding athlete names or races.
   */
  const scrapeAllGridPages = async () => {
    let previousSignature = '';
    let pageNo = 1;
    let totalPages = 1;

    const parseMainGrid = async () => {
      const html = await page.content();
      const tables = parseTables(html)
        .filter((table) => findResultHeader(table) >= 0)
        .sort((a, b) => b.length - a.length);

      const main = tables[0] || [];
      const rows = rowsFromTable(main);
      const before = all.length;
      addRows(rows, race.url);
      return {
        html,
        rows,
        count: all.length - before,
        signature: rows.slice(0, 5).map(r =>
          `${r.firstName}|${r.lastName}|${r.field}|${r.place}|${r.time}`
        ).join('||')
      };
    };

    const findPagerControl = async (wantedPage) => {
      return page.evaluate((wanted) => {
        const targetText = String(wanted);
        const elements = [...document.querySelectorAll('a, input, button, span')];

        const attrValue = (el, name) => {
          const v = el.getAttribute(name);
          return v ? String(v) : '';
        };

        const parsePostback = (value) => {
          const decoded = String(value || '')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/&#x27;/gi, "'")
            .replace(/&amp;/gi, '&');
          const m = decoded.match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
          return m ? { target: m[1], argument: m[2] } : null;
        };

        for (const el of elements) {
          const text = (el.textContent || '').trim();
          const value = attrValue(el, 'value').trim();
          if (text !== targetText && value !== targetText) continue;

          const candidates = [
            attrValue(el, 'href'),
            attrValue(el, 'onclick'),
            attrValue(el, 'oncommand'),
            attrValue(el, 'data-href')
          ];

          for (const candidate of candidates) {
            const post = parsePostback(candidate);
            if (post && post.argument.endsWith(`Page$${wanted}`)) {
              return { mode: 'postback', target: post.target, argument: post.argument };
            }
          }

          // ASP.NET can render a page-number input/button without an
          // explicit __doPostBack string. Clicking the live control lets
          // the browser submit the form exactly as the site expects.
          if (el.tagName === 'A' || el.tagName === 'INPUT' || el.tagName === 'BUTTON') {
            return { mode: 'click', selectorHint: el.outerHTML.slice(0, 1000) };
          }
        }

        // Last fallback: search every element for an embedded Page$N
        // postback, even if the visible text is not exactly the page number.
        for (const el of elements) {
          const values = [
            attrValue(el, 'href'),
            attrValue(el, 'onclick'),
            attrValue(el, 'oncommand')
          ];
          for (const candidate of values) {
            const post = parsePostback(candidate);
            if (post && post.argument.endsWith(`Page$${wanted}`)) {
              return { mode: 'postback', target: post.target, argument: post.argument };
            }
          }
        }

        return null;
      }, wantedPage);
    };

    const triggerNextPage = async (nextPage) => {
      const control = await findPagerControl(nextPage);

      if (!control) {
        console.warn(`  GRID: could not locate live pager control for page ${nextPage}; stopping.`);
        return false;
      }

      if (control.mode === 'postback') {
        await page.evaluate(({ target, argument }) => {
          if (typeof window.__doPostBack !== 'function') {
            throw new Error('ASP.NET __doPostBack is not available.');
          }
          window.__doPostBack(target, argument);
        }, control);
      } else {
        // Find the exact element again by its visible value/text and click it.
        const clicked = await page.evaluate((wanted) => {
          const elements = [...document.querySelectorAll('a, input, button')];
          const el = elements.find(node => {
            const text = (node.textContent || '').trim();
            const value = (node.getAttribute('value') || '').trim();
            return text === String(wanted) || value === String(wanted);
          });
          if (!el) return false;
          el.click();
          return true;
        }, nextPage);
        if (!clicked) return false;
      }

      await waitForPostback();
      return true;
    };

    while (pageNo <= totalPages && pageNo <= 200) {
      const current = await parseMainGrid();
      const pageText = clean(strip(current.html));
      const m = pageText.match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
      totalPages = Math.max(1, Number(m?.[2]) || 1);

      console.log(`  GRID: page ${pageNo}/${totalPages} -> ${current.count} new rows`);

      if (current.signature && current.signature === previousSignature) {
        console.warn(`  GRID: page ${pageNo} repeated the previous page; stopping to avoid duplicates.`);
        break;
      }
      previousSignature = current.signature;

      if (pageNo >= totalPages) break;

      const nextPage = pageNo + 1;
      const moved = await triggerNextPage(nextPage);
      if (!moved) break;

      // The postback should change the first few result rows. If it does
      // not, do one short retry after the page has settled.
      let changed = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(250);
        const check = await page.evaluate(() => {
          const tables = [...document.querySelectorAll('table')];
          const candidate = tables
            .map(t => ({
              rows: t.querySelectorAll('tr').length,
              text: (t.innerText || '').slice(0, 1200)
            }))
            .filter(x => x.rows > 1)
            .sort((a, b) => b.rows - a.rows)[0];
          return candidate?.text || '';
        });
        if (check && check !== pageText.slice(0, 1200)) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        // Do not immediately give up: parse the live page once more. Some
        // ASP.NET responses update the DOM after networkidle returns.
        await page.waitForTimeout(500);
      }

      pageNo = nextPage;
    }

    return totalPages;
  };

  try {
    await page.goto(race.url, { waitUntil: 'domcontentloaded', timeout: a.timeout });
    await page.waitForTimeout(350);

    // The default GridView contains all four Nordic fields (BJV, BVAR,
    // GJV, GVAR) and paginates the complete result set. Do NOT scrape only
    // the currently visible field or hard-code a boys/girls selection.
    const sizeSelect = await findPageSizeSelect();
    if (sizeSelect) {
      try {
        await page.locator('select').nth(sizeSelect.index).selectOption({ label: '50' });
        await waitForPostback();
      } catch (e) {
        console.warn(`  GRID: could not set page size to 50: ${e.message}`);
      }
    }

    const fieldSelect = await findFieldSelect();

    if (fieldSelect) {
      const fieldOptions = fieldSelect.options
        .filter(o => /^(BJV|BVAR|GJV|GVAR)$/i.test(o.text.trim()))
        .map(o => ({ value: o.value, text: o.text.trim() }));

      if (fieldOptions.length === 4) {
        console.log(`  FIELD FILTER: scraping each Nordic field separately: ${fieldOptions.map(f => f.text).join(', ')}`);

        for (const field of fieldOptions) {
          // Start each field from a fresh race page so ASP.NET keeps a clean
          // ViewState/EventValidation state for that field's grid.
          await page.goto(race.url, { waitUntil: 'domcontentloaded', timeout: a.timeout });
          await page.waitForTimeout(300);

          const freshSize = await findPageSizeSelect();
          if (freshSize) {
            try {
              await page.locator('select').nth(freshSize.index).selectOption({ label: '50' });
              await waitForPostback();
            } catch (e) {
              console.warn(`  FIELD ${field.text}: could not set page size to 50: ${e.message}`);
            }
          }

          const freshField = await findFieldSelect();
          if (!freshField) {
            console.warn(`  FIELD ${field.text}: field selector disappeared; skipping field.`);
            continue;
          }

          try {
            await page.locator('select').nth(freshField.index).selectOption({ value: field.value });
            await waitForPostback();
          } catch (e) {
            console.warn(`  FIELD ${field.text}: field selection failed: ${e.message}`);
            continue;
          }

          console.log(`  FIELD ${field.text}: selected; scraping its result grid`);
          await scrapeAllGridPages();
        }
      } else {
        console.log('  FIELD FILTER: field selector found, but not all four Nordic fields were available; scraping complete result grid.');
        await scrapeAllGridPages();
      }
    } else {
      console.log('  FIELD FILTER: no BJV/BVAR/GJV/GVAR selector found; scraping complete result grid.');
      await scrapeAllGridPages();
    }

    // Also inspect every downloadable result link exposed by the page. These
    // are especially useful for championship pages whose HTML grid is empty.
    const links = await page.locator('a').evaluateAll(anchors => anchors.map(a => ({ href: a.href, text: (a.textContent || '').trim() })));
    for (const link of links) {
      if (/\.txt(?:\?|$)/i.test(link.href)) {
        const response = await fetchText(link.href, a.timeout);
        if (!response.body) continue;
        const rows = parseText(response.body, inferGenderFromText(`${link.text} ${response.body}`), inferFieldFromText(response.body));
        if (rows.length) { addRows(rows, link.href); stats.txt++; }
      } else if (/\.pdf(?:\?|$)/i.test(link.href)) {
        try {
          const response = await fetch(link.href, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)' } });
          if (!response.ok) continue;
          const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
          const rows = parseText(parsed.text, inferGenderFromText(`${link.text} ${parsed.text}`), inferFieldFromText(parsed.text));
          if (rows.length) { addRows(rows, link.href); stats.pdf++; }
        } catch {}
      }
    }

    const male = all.filter(r => r.gender === 'M').length;
    const female = all.filter(r => r.gender === 'F').length;
    const unknown = all.length - male - female;
    stats.racesWithRows += all.length ? 1 : 0;
    stats.maleRows += male;
    stats.femaleRows += female;
    stats.unknownGenderRows += unknown;
    stats.perRace.push({ raceKey: race.id, event: race.event, rows: all.length, male, female, unknown });
    console.log(`  RACE TOTAL: ${all.length} rows (M ${male}, F ${female}, unknown ${unknown})`);
    return all;
  } finally {
    await page.close();
  }
}

/*
 * Small duplicate key.
 *
 * We retain only this string in memory,
 * not duplicate result objects.
 */
function rowKey(r) {
  // ResultsKey is unique to a result row and changes every race. Do not use
  // it for identity or deduplication. Race + athlete fields identify the
  // result while still allowing the same athlete to appear in many races.
  return [
    r.sourceRaceId || '',
    norm(r.firstName),
    norm(r.lastName),
    r.bib || '',
    r.time || '',
    r.place || ''
  ].join('|');
}

function dedupeRows(
  rows,
  seen
) {
  const unique = [];

  for (
    const row of rows
  ) {
    const key =
      rowKey(row);

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    unique.push(
      row
    );
  }

  return unique;
}

/*
 * STREAM RESULTS DIRECTLY INTO ONE TEMP JSON FILE.
 *
 * This replaces the old giant NDJSON file.
 *
 * There is now only ONE temporary results file,
 * and we never keep the complete result set in memory.
 */
async function createStreamingOutput(
  out
) {
  await fs.mkdir(
    path.dirname(out),
    {
      recursive: true
    }
  );

  const tmp =
    out + '.tmp';

  /*
   * Remove an abandoned temporary file from
   * a previous failed run.
   */
  try {
    await fs.unlink(
      tmp
    );
  } catch {
    // Nothing to remove.
  }

  const stream =
    fsSync.createWriteStream(
      tmp,
      {
        encoding: 'utf8'
      }
    );

  const write =
    chunk =>
      writeChunk(stream, chunk);

  /*
   * matches comes first.
   *
   * JSON property order does not matter.
   *
   * Metadata is written after all matches are
   * known, which lets us stream the huge result
   * dataset without a second copy.
   */
  await write(
    '{\n' +
    '  "matches": [\n'
  );

  return {
    tmp,
    stream,
    write
  };
}

async function finishStreamingOutput(
  output,
  metadata
) {
  await writeChunk(
    output.stream,
    '\n  ],\n' +
    `  "generatedAt": ${JSON.stringify(metadata.generatedAt)},\n` +
    `  "source": ${JSON.stringify(metadata.source)},\n` +
    `  "sport": ${JSON.stringify(metadata.sport)},\n` +
    `  "raceCount": ${metadata.raceCount},\n` +
    `  "rowCount": ${metadata.rowCount},\n` +
    `  "errorCount": ${metadata.errorCount},\n` +
    '  "diagnostics": ' +
    JSON.stringify(
      metadata.diagnostics,
      null,
      2
    ) +
    '\n}\n'
  );

  await endStream(output.stream);

  await fs.rename(
    output.tmp,
    metadata.out
  );
}

/*
 * Check that a previous good result file isn't
 * being replaced by a completely empty run.
 */
/* Backpressure-aware stream writing. stream.write() returns a boolean, not a Promise. */
function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    if (stream.write(chunk)) { resolve(); return; }
    const drain = () => { cleanup(); resolve(); };
    const error = e => { cleanup(); reject(e); };
    function cleanup() { stream.off('drain', drain); stream.off('error', error); }
    stream.once('drain', drain);
    stream.once('error', error);
  });
}

function endStream(stream) {
  return new Promise((resolve, reject) => {
    const finish = () => { cleanup(); resolve(); };
    const error = e => { cleanup(); reject(e); };
    function cleanup() { stream.off('finish', finish); stream.off('error', error); }
    stream.once('finish', finish); stream.once('error', error); stream.end();
  });
}

async function previousRowCount(
  out
) {
  try {
    const text =
      await fs.readFile(
        out,
        'utf8'
      );

    /*
     * We only need the number.
     *
     * Do NOT parse the entire JSON object.
     */
    const match =
      text.match(
        /"rowCount"\s*:\s*(\d+)/
      );

    return match
      ? Number(match[1])
      : 0;

  } catch {
    return 0;
  }
}

async function main() {
  const a =
    args(
      process.argv.slice(2)
    );

  console.log(
    'Endurance Promotions Nordic scraper v7'
  );

  console.log(
    `Starting RaceKey: ${a.startId}`
  );

  console.log(
    `Maximum RaceKey: ${a.maxId}`
  );

  console.log(
    `Batch size: ${a.batchSize}`
  );

  console.log(
    `Concurrency: ${a.concurrency}`
  );

  /*
   * STEP 1
   *
   * Discover only RaceKeys beginning at 1723.
   */
  const races =
    await discoverByIds(a);

  console.log(
    `DISCOVERY COMPLETE: ${races.length} race pages discovered.`
  );

  /*
   * STEP 2
   *
   * Create the one temporary streaming JSON file.
   */
  const output =
    await createStreamingOutput(
      a.out
    );

  const browser = await chromium.launch({ headless: true });

  let firstRow =
    true;

  /*
   * Only duplicate keys are retained.
   */
  const seen =
    new Set();

  const stats = {
    nordic: 0,
    racesWithRows: 0,
    txt: 0,
    pdf: 0,
    childPages: 0,
    maleRows: 0,
    femaleRows: 0,
    unknownGenderRows: 0,
    perRace: []
  };

  let totalRows =
    0;

  let raceCount =
    0;

  let errors =
    0;

  /*
   * STEP 3
   *
   * Process Nordic races in batches of 10.
   */
  for (
    let start = 0;
    start < races.length;
    start += a.batchSize
  ) {
    const end =
      Math.min(
        start +
          a.batchSize,
        races.length
      );

    console.log(
      ''
    );

    console.log(
      `========== BATCH ${Math.floor(start / a.batchSize) + 1} ==========`
    );

    console.log(
      `Races ${start + 1}-${end} of ${races.length}`
    );

    for (
      let index = start;
      index < end;
      index++
    ) {
      const race =
        races[index];

      /*
       * Do not print every non-Nordic race.
       *
       * This keeps the GitHub Actions log much smaller.
       */
      if (
        !looksNordic(race)
      ) {
        continue;
      }

      console.log(
        `RACE ${index + 1}/${races.length}: ${race.event} | ${race.date} | ${race.raceType} | RaceKey ${race.id}`
      );

      try {
        const rows =
          await processRace(
            race,
            a,
            stats,
            browser
          );

        const unique =
          dedupeRows(
            rows,
            seen
          );

        if (
          unique.length
        ) {
          raceCount++;

          for (
            const row of unique
          ) {
            if (
              !firstRow
            ) {
              await output.write(',\n');
            }

            await output.write(
              '    ' + JSON.stringify(row)
            );

            firstRow =
              false;

            totalRows++;
          }
        }

        /*
         * Release the race's result objects.
         */
        rows.length = 0;

      } catch (error) {
        errors++;

        console.warn(
          `RACE ERROR ${race.id}: ${error.message}`
        );
      }
    }

    /*
     * Force garbage collection if GitHub's Node
     * process was started with --expose-gc.
     */
    if (
      typeof global.gc ===
      'function'
    ) {
      global.gc();
    }

    console.log(
      `BATCH COMPLETE: ${end}/${races.length}`
    );

    console.log(
      `RESULTS SO FAR: ${raceCount} races, ${totalRows} unique rows`
    );
  }

  await browser.close();

  /*
   * STEP 4
   *
   * Protect an existing good results file.
   */
  const oldRows =
    await previousRowCount(
      a.out
    );

  if (
    totalRows === 0 &&
    oldRows > 0
  ) {
    /*
     * Close/remove the temporary output.
     */
    try {
      output.stream.destroy();
    } catch {
      // Ignore.
    }

    try {
      await fs.unlink(
        output.tmp
      );
    } catch {
      // Ignore.
    }

    throw new Error(
      `Refusing to overwrite ${a.out}: scraper returned 0 rows while previous file contains ${oldRows} rows.`
    );
  }

  /*
   * STEP 5
   *
   * Finish the JSON document.
   */
  const metadata = {
    out: a.out,

    generatedAt:
      new Date().toISOString(),

    source:
      BASE,

    sport:
      a.sport,

    raceCount,

    rowCount:
      totalRows,

    errorCount:
      errors,

    diagnostics: {
      racePagesDiscovered:
        races.length,

      startRaceKey:
        a.startId,

      maxRaceKey:
        a.maxId,

      nordicRaces:
        stats.nordic,

      nordicRacesWithRows:
        stats.racesWithRows,

      resultTxtFiles:
        stats.txt,

      resultPdfFiles:
        stats.pdf,

      childResultPages:
        stats.childPages,

      batchSize:
        a.batchSize,

      concurrency:
        a.concurrency,

      maleRows:
        stats.maleRows,

      femaleRows:
        stats.femaleRows,

      unknownGenderRows:
        stats.unknownGenderRows,

      perRace:
        stats.perRace
    }
  };

  console.log(
    ''
  );

  console.log(
    'FINAL DIAGNOSTICS:',
    JSON.stringify(
      metadata.diagnostics
    )
  );

  console.log(
    `OUTPUT: ${raceCount} races, ${totalRows} rows`
  );

  await finishStreamingOutput(
    output,
    metadata
  );

  console.log(
    `DONE: wrote ${a.out}`
  );
}

main().catch(
  error => {
    console.error(
      'FATAL SCRAPER ERROR:',
      error
    );

    process.exit(1);
  }
);
