#!/usr/bin/env node

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const pdfParse = require('pdf-parse');

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
 * Process one race.
 */
async function processRace(race, a, stats) {
  if (!looksNordic(race)) return [];

  stats.nordic++;

  const all = [];
  const addRows = (rows, sourceUrl) => {
    for (const row of rows) {
      if (!row || (!row.firstName && !row.lastName)) continue;
      all.push({
        ...row,
        event: race.event,
        raceDate: race.date,
        raceLocation: race.location,
        raceType: race.raceType,
        sourceRaceId: race.id,
        sourceRaceUrl: race.url,
        sourceResultUrl: sourceUrl || race.url,
      });
    }
  };

  const seenPages = new Set();
  const fileLinks = new Map();

  // The main results grid is usually filtered to the first field on page load.
  // We explicitly visit every field exposed by the page so girls/women are not
  // silently omitted when the default field is BJV/Boys.
  let totalPages = 1;
  let firstPageHtml = '';

  const collectGridPage = (html, sourceUrl) => {
    const pageTables = parseTables(html);
    let rowsFound = 0;
    for (const table of pageTables) {
      const rows = rowsFromTable(table);
      if (rows.length) {
        addRows(rows, sourceUrl);
        rowsFound += rows.length;
      }
    }
    return rowsFound;
  };

  const first = await fetchGridPage(race.url, 1, '', a);
  firstPageHtml = first.body || '';
  if (!firstPageHtml) return [];

  const fieldFilter = findFieldFilter(firstPageHtml);
  const fields = fieldFilter?.options?.length ? fieldFilter.options : [null];
  if (fieldFilter) {
    console.log(`  FIELD FILTER: ${fields.map(f => f.text).join(', ')}`);
  } else {
    console.log('  FIELD FILTER: none detected; using the page default');
  }

  const scrapeField = async (fieldOption) => {
    let pageOneHtml = firstPageHtml;
    let fieldLabel = fieldOption?.text || '';

    if (fieldOption && fieldFilter) {
      const filtered = await postFieldFilter(race.url, firstPageHtml, fieldFilter, fieldOption, a);
      if (filtered.body) pageOneHtml = filtered.body;
      else return 0;
    }

    const fieldGender = inferGenderFromText(fieldLabel);
    let fieldRows = collectGridPage(pageOneHtml, race.url);
    const pageInfo = strip(pageOneHtml).match(/(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i);
    totalPages = Math.min(Number(pageInfo?.[2]) || 1, 200);
    console.log(`  GRID: field ${fieldLabel || 'default'} page 1 -> ${fieldRows} rows; ${totalPages} total pages`);

    let previousFirstKey = '';
    for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
      const pageResult = await fetchGridPage(race.url, pageNo, pageOneHtml, a, fieldOption?.value || null);
      if (!pageResult.body) break;
      const rowsFound = collectGridPage(pageResult.body, race.url);
      console.log(`  GRID: field ${fieldLabel || 'default'} page ${pageNo}/${totalPages} -> ${rowsFound} rows`);
      const pageRows = parseTables(pageResult.body).flatMap(rowsFromTable);
      const currentFirstKey = pageRows[0] ? `${norm(pageRows[0].firstName)}|${norm(pageRows[0].lastName)}|${pageRows[0].time}` : '';
      if (currentFirstKey && currentFirstKey === previousFirstKey) break;
      previousFirstKey = currentFirstKey;
      if (rowsFound === 0) break;
      pageOneHtml = pageResult.body;
    }

    // If the grid did not carry gender, infer it from the selected field.
    for (const row of all) {
      if (!row.gender && fieldGender && (!fieldLabel || norm(row.field) === norm(fieldLabel))) row.gender = fieldGender;
    }
    return fieldRows;
  };

  if (fields.length) {
    for (const field of fields) await scrapeField(field);
  } else {
    await scrapeField(null);
  }

  // The first page contains downloadable TXT/PDF/child-result links.
  for (const link of parseLinks(firstPageHtml)) {
    if (/\.(txt|pdf)(\?|$)/i.test(link.href) || /ResultDetails\.aspx/i.test(link.href)) {
      fileLinks.set(link.href, link);
    }
  }

  // Some Endurance Promotions pages expose downloadable TXT/PDF result
  // files instead of putting the complete field in the HTML grid.
  for (const link of fileLinks.values()) {
    if (/ResultDetails\.aspx/i.test(link.href)) {
      if (seenPages.has(link.href)) continue;

      const response = await fetchText(link.href, a.timeout);
      if (!response.body) continue;

      const childId = new URL(link.href).searchParams.get('id') || race.id;
      const child = raceMeta(response.body, childId);

      if (looksNordic(child)) {
        for (const table of parseTables(response.body)) {
          addRows(rowsFromTable(table), link.href);
        }
        stats.childPages++;
      }
      continue;
    }

    if (/\.txt/i.test(link.href)) {
      const response = await fetchText(link.href, a.timeout);
      if (!response.body) continue;

      const rows = parseText(response.body, inferGenderFromText(response.body), inferFieldFromText(response.body));
      if (rows.length) {
        addRows(rows, link.href);
        stats.txt++;
      }
      continue;
    }

    if (/\.pdf/i.test(link.href)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), a.timeout);

        try {
          const response = await fetch(link.href, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)' },
          });

          if (!response.ok) continue;

          const buffer = Buffer.from(await response.arrayBuffer());
          const parsed = await pdfParse(buffer);
          const rows = parseText(parsed.text, inferGenderFromText(parsed.text), inferFieldFromText(parsed.text));

          if (rows.length) {
            addRows(rows, link.href);
            stats.pdf++;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Ignore an individual PDF failure; the rest of the race remains usable.
      }
    }
  }

  if (all.length) stats.racesWithRows++;
  return all;
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
    unknownGenderRows: 0
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
            stats
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
            if (row.gender === 'M') stats.maleRows++;
            else if (row.gender === 'F') stats.femaleRows++;
            else stats.unknownGenderRows++;

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
        stats.unknownGenderRows
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
