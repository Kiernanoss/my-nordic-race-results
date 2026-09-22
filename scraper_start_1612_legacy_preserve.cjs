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
  // Start at RaceKey 1612 so the earlier season races are included.
  startId: 1612,

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

--start-id 1612
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

  // Some Nordic relay events are mislabeled as Cycling. Identify them from
  // the result documents actually published on the page, never by RaceKey.
  const resultText = norm((r.resultLinks || []).map(x => x.text).join(' '));
  if (/\b(?:boys?|girls?)\b/.test(resultText) && /\bclassic\b/.test(resultText) && /\brelay\b/.test(resultText)) {
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
    const hasNames = (ks.includes('firstname') && ks.includes('lastname')) || (ks.includes('name') && ks.includes('lastname'));
    const hasTime = ks.includes('totaltime') || ks.includes('time') || ks.includes('totaltime');
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

/*
 * Older Endurance Promotions Nordic results (including the races around
 * RaceKey 1612) use the Class column for school grade, for example M11/F11,
 * while the Field column carries the actual race division and distance,
 * such as Boys JV 2K, Boys JV 4K, or Girls Varsity.
 *
 * Keep the raw grade in `class`, but normalize Field to the same BJV/BVAR/
 * GJV/GVAR codes used by the newer result layout.  This lets the existing
 * app treat old and new seasons consistently without hard-coding a race.
 */
function legacyGradeGender(className) {
  const value = norm(className).replace(/\s+/g, '');
  if (/^[mf](?:0?[0-9]|1[0-2])$/.test(value)) {
    return value[0] === 'm' ? 'M' : 'F';
  }
  return '';
}

function normalizeNordicField(field, className = '') {
  const raw = clean(field);
  const value = norm(raw);
  const gender = inferGender(raw, className) || legacyGradeGender(className);

  const girls = gender === 'F';
  const boys = gender === 'M';

  let division = '';
  if (/\bvarsity\b|\bvar\b|\bvars\b/.test(value)) division = 'VAR';
  else if (/\bjv\b|junior\s*varsity|juniorvarsity/.test(value)) division = 'JV';

  if (division && boys) return `B${division}`;
  if (division && girls) return `G${division}`;

  // Newer pages already use compact field names such as BJV/GVAR.
  if (/^(?:b|g)(?:jv|var)$/.test(value.replace(/[^a-z]/g, ''))) {
    return value.replace(/[^a-z]/g, '').toUpperCase();
  }

  return raw;
}

function fieldDistance(field) {
  const m = norm(field).match(/\b(\d+(?:\.\d+)?)\s*k\b/);
  return m ? Number(m[1]) : null;
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
    let first =
      get(r, 'First Name');

    let last =
      get(r, 'Last Name');

    if (!first && !last) {
      const fullName = get(r, 'Name');
      if (fullName) {
        const parsedName = splitName(fullName);
        first = parsedName.firstName;
        last = parsedName.lastName;
      }
    }

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

    const rawField = get(r, 'Field');
    const className = get(r, 'Class');
    const normalizedField = normalizeNordicField(rawField, className);
    const gender = get(r, 'Gender') || inferGender(rawField, className) || legacyGradeGender(className) || inferGender(normalizedField, className) || null;
    const distanceKm = fieldDistance(rawField);

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
        normalizedField,

      distanceKm,

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

function makeRelayAthleteRows(place, pih, bib, firstPartner, secondPartner, club, heat, time, genderHint, fieldHint) {
  const out = [];
  const partners = [clean(firstPartner), clean(secondPartner)].filter(Boolean);
  const hintedGender = genderHint ? String(genderHint).toUpperCase() : null;

  for (const partner of partners) {
    const n = splitName(partner.replace(/\s*&\s*$/g, '').trim());
    if (!n.firstName || !n.lastName) continue;

    out.push({
      firstName: n.firstName,
      lastName: n.lastName,
      name: `${n.firstName} ${n.lastName}`,
      team: club || '',
      school: club || '',
      class: fieldHint || '',
      field: fieldHint || '',
      city: '',
      gender: hintedGender,
      age: null,
      bib: bib || null,
      place: Number(place) || null,
      time,
      timeSeconds: timeSec(time),
      sourceAthleteId: null,
      relay: true,
      relayPIH: pih || null,
      relayHeat: heat || ''
    });
  }

  return out;
}

/*
 * Relay PDF fallback parser.
 *
 * Some Endurance relay PDFs are encoded so pdf-parse's normal text stream
 * does not preserve the visible table rows. The browser screenshot shows a
 * real 8-column table, so we also build a row-oriented text stream from the
 * PDF text items' x/y coordinates. This is generic: it detects the visible
 * relay header and then groups the following items by horizontal position.
 */
async function pdfTextByCoordinates(buffer) {
  try {
    const options = {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false });
        const items = (content.items || [])
          .map(item => {
            const t = clean(item.str);
            const tr = item.transform || [];
            return {
              text: t,
              x: Number(tr[4]) || 0,
              y: Number(tr[5]) || 0
            };
          })
          .filter(x => x.text);

        // PDF coordinates have a bottom-left origin. Group nearby y values
        // into visual lines, then read each line from left to right.
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        const yTolerance = 3;
        for (const item of items) {
          let line = lines.find(l => Math.abs(l.y - item.y) <= yTolerance);
          if (!line) {
            line = { y: item.y, items: [] };
            lines.push(line);
          }
          line.items.push(item);
        }
        lines.sort((a, b) => b.y - a.y);
        return lines.map(line =>
          line.items
            .sort((a, b) => a.x - b.x)
            .map(x => x.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        ).filter(Boolean).join('\n');
      }
    };
    const parsed = await pdfParse(buffer, options);
    return parsed.text || '';
  } catch (e) {
    return '';
  }
}

function parseRelayRowsFromLines(text, genderHint = null, fieldHint = null) {
  const lines = String(text || '')
    .replace(/\f/g, '\n')
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
  const out = [];

  const timeRe = /^\d{1,3}:\d{2}(?:\.\d+)?$/;
  const bibRe = /^\d+(?:\/\d+)?$/;
  const heatRe = /^[A-Za-z][A-Za-z0-9_-]*\s*\d+$/;

  // Row-oriented extraction usually gives exactly the visual row shown in
  // the PDF. Do not depend on a particular school, athlete, or race name.
  for (const line of lines) {
    const m = line.match(
      /^(\d+)\s+(\d+)\s+(\d+(?:\/\d+)?)\s+(.+?)\s*&\s+(.+?)\s+(.+?)\s+([A-Za-z][A-Za-z0-9_-]*\s*\d+)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/
    );
    if (!m) continue;
    if (!bibRe.test(m[3]) || !timeRe.test(m[8]) || !heatRe.test(m[7])) continue;
    const rows = makeRelayAthleteRows(m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], genderHint, fieldHint);
    out.push(...rows);
  }

  if (out.length) return out;

  // If PDF text extraction separates columns, look for the seven fields
  // immediately before a time value.
  for (let i = 0; i < lines.length; i++) {
    if (!timeRe.test(lines[i])) continue;
    for (let j = Math.max(0, i - 10); j < i; j++) {
      const c = lines.slice(j, i);
      if (c.length !== 7) continue;
      const [place, pih, bib, first, second, club, heat] = c;
      if (!/^\d+$/.test(place) || !/^\d+$/.test(pih) || !bibRe.test(bib)) continue;
      if (!/\s*&\s*$/.test(first) || !/^[A-Za-z]/.test(second)) continue;
      if (!club || !heatRe.test(heat)) continue;
      out.push(...makeRelayAthleteRows(place, pih, bib, first, second, club, heat, lines[i], genderHint, fieldHint));
      break;
    }
  }
  return out;
}

/*
 * Relay PDFs from Endurance Promotions use a different layout from the
 * normal individual-result PDFs. A typical row has:
 *
 * Pos | PIH | No. | First Name & | Last Name | Club | Heat | Total Tm
 *
 * pdf-parse can return that as one physical line OR as one column value per
 * line. This parser handles both forms without knowing a race ID, school,
 * team, or particular heat name in advance.
 */
function parseRelayPdfText(text, genderHint = null, fieldHint = null) {
  const out = [];
  const lines = String(text || '')
    .replace(/\f/g, '\n')
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const pushPair = (place, pih, bib, firstPartner, secondPartner, club, heat, time) => {
    if (!/^\d+$/.test(String(place || ''))) return;
    if (!/^\d+(?:\/\d+)?$/.test(String(bib || ''))) return;
    if (!/^\d{1,3}:\d{2}(?:\.\d+)?$/.test(String(time || ''))) return;
    if (!firstPartner || !secondPartner) return;
    out.push(...makeRelayAthleteRows(place, pih, bib, firstPartner, secondPartner, club, heat, time, genderHint, fieldHint));
  };

  // Mode 1: pdf-parse kept the whole result row on one line.
  for (const line of lines) {
    const m = line.match(
      /^(\d+)\s+(\d+)\s+(\d+(?:\/\d+)?)\s+(.+?)\s*&\s+(.+?)\s+(.+?)\s+([A-Za-z][A-Za-z0-9_-]*\s*\d+)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/
    );
    if (m) pushPair(m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
  }

  if (out.length) return out;

  // Mode 2: pdf-parse returned each visible column as a separate line.
  // Find a time, then look backward for the seven values that precede it.
  // We validate every value so ordinary individual-result PDFs do not get
  // misclassified as relays.
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i];
    if (!/^\d{1,3}:\d{2}(?:\.\d+)?$/.test(time)) continue;

    const start = Math.max(0, i - 9);
    for (let j = i - 7; j >= start; j--) {
      const chunk = lines.slice(j, i);
      if (chunk.length !== 7) continue;

      const [place, pih, bib, firstPartner, secondPartner, club, heat] = chunk;
      if (!/^\d+$/.test(place)) continue;
      if (!/^\d+$/.test(pih)) continue;
      if (!/^\d+(?:\/\d+)?$/.test(bib)) continue;
      if (!/\s*&\s*$/.test(firstPartner)) continue;
      if (!/^[A-Za-z]/.test(secondPartner)) continue;
      if (!club || !heat) continue;
      if (!/^[A-Za-z][A-Za-z0-9_-]*\s*\d+$/.test(heat)) continue;

      pushPair(place, pih, bib, firstPartner, secondPartner, club, heat, time);
      break;
    }
  }

  return out;
}


function parseRelayFinalPdfText(text, genderHint = null, fieldHint = null) {
  const lines = String(text || '')
    .replace(/\f/g, '\n')
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const out = [];
  const timeRe = /^\d{1,3}:\d{2}(?:\.\d+)?$/;
  const bibRe = /^\d+(?:\/\d+)?$/;

  // Endurance uses more than one final-relay layout. This parser handles the
  // older Section-style layout as well as the simpler MEC team-relay layout:
  //
  //   Pos No. First Name Last Name Club Category Total Tm
  //   1 266/267 Abraham Jansen & Ethan Albrecht Mahtomedi Boys Final 18:41.1
  //
  // The important part is the visible table structure, not a race ID, school,
  // athlete name, or filename.
  const simpleFinal = lines.some(line =>
    /\bPos\b/i.test(line) &&
    /\bNo\.?\b/i.test(line) &&
    /\bFirst\s+Name\b/i.test(line) &&
    /\bLast\s+Name\b/i.test(line) &&
    /\bClub\b/i.test(line) &&
    /\bCategory\b/i.test(line) &&
    /\bTotal\s+Tm\b/i.test(line)
  );

  const sectionFinal = lines.some(line =>
    /\bFINAL\s+POS\b/i.test(line) &&
    /\bRELAY[_\s]*PTS\b/i.test(line) &&
    /\bSEX\b/i.test(line)
  );

  // The Section 1/5 final layout is already handled by the older parser logic
  // below. Keep that format working without changing normal result parsing.
  if (sectionFinal && !simpleFinal) {
    const sexRe = /^[MF]$/i;
    const pointsRe = /^\d{2,3}$/;
    const divRe = /^(?:BRLY|GRLY|Boys?\s+Final|Girls?\s+Final)$/i;

    function addSectionRow(place, bib, firstPartner, secondPartner, team, time, sex, div) {
      if (!/^\d+$/.test(place) || !bibRe.test(bib) || !firstPartner || !secondPartner) return;
      if (time && !timeRe.test(time)) return;
      if (sex && !sexRe.test(sex)) return;
      const inferredGender = sex
        ? (String(sex).toUpperCase() === 'M' ? 'M' : 'F')
        : genderHint;
      const rows = makeRelayAthleteRows(
        place, null, bib, firstPartner, secondPartner, team,
        'Final', time || '', inferredGender, div || fieldHint || ''
      );
      out.push(...rows.map(r => ({ ...r, relayFinal: true })));
    }

    for (const line of lines) {
      let rest = line;
      let time = '';
      let m = rest.match(/^(\d{1,3}:\d{2}(?:\.\d+)?)\s+/);
      if (m) {
        time = m[1];
        rest = rest.slice(m[0].length).trim();
      }

      m = rest.match(/^(\d+)\s+(\d+(?:\/\d+)?)\s+(.+)$/);
      if (!m) continue;
      const place = m[1];
      const bib = m[2];
      let body = m[3].trim();

      const sexM = body.match(/\s+([MF])$/i);
      if (!sexM) continue;
      const sex = sexM[1].toUpperCase();
      body = body.slice(0, sexM.index).trim();

      const ptsM = body.match(/\s+(\d{2,3})$/);
      if (!ptsM || !pointsRe.test(ptsM[1])) continue;
      body = body.slice(0, ptsM.index).trim();

      const divM = body.match(/\s+((?:BRLY|GRLY|Boys?\s+Final|Girls?\s+Final))$/i);
      if (!divM || !divRe.test(divM[1])) continue;
      const div = divM[1];
      body = body.slice(0, divM.index).trim();

      const amp = body.indexOf(' & ');
      if (amp < 0) continue;
      const firstPartner = body.slice(0, amp).trim();
      const remainder = body.slice(amp + 3).trim();
      const tokens = remainder.split(/\s+/);
      if (tokens.length < 3) continue;

      // This layout normally has a two-token second name. Allow a three-token
      // second name only when there are still tokens left for the team.
      let secondPartner = tokens.slice(0, 2).join(' ');
      let team = tokens.slice(2).join(' ');
      if (!team && tokens.length >= 4) {
        secondPartner = tokens.slice(0, 3).join(' ');
        team = tokens.slice(3).join(' ');
      }
      if (!team) continue;
      addSectionRow(place, bib, firstPartner, secondPartner, team, time, sex, div);
    }
    return out;
  }

  if (!simpleFinal) return out;

  // The simple MEC layout can be parsed from the row-oriented coordinate
  // reconstruction already produced by pdfTextByCoordinates(). In that text
  // stream the category is immediately before the time, so the only hard
  // boundary left is between the second athlete and the club. We handle the
  // common two/three-token name cases here, and the coordinate parser below
  // supplies an exact column-based fallback when the PDF preserves x-values.
  for (const line of lines) {
    const tm = line.match(/(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (!tm) continue;
    const time = tm[1];
    const beforeTime = line.slice(0, tm.index).trim();

    const catM = beforeTime.match(/\s+(Boys?\s+Final|Girls?\s+Final)$/i);
    if (!catM) continue;
    const category = catM[1];
    const body = beforeTime.slice(0, catM.index).trim();

    const m = body.match(/^(\d+)\s+(\d+(?:\/\d+)?)\s+(.+?)\s*&\s+(.+)$/);
    if (!m) continue;

    const place = m[1];
    const bib = m[2];
    const firstPartner = m[3].trim();
    const remainder = m[4].trim();
    if (!/^\d+$/.test(place) || !bibRe.test(bib) || !firstPartner || !remainder) continue;

    const tokens = remainder.split(/\s+/);
    if (tokens.length < 3) continue;

    // Try a two-token second name first. If that leaves no club, try three.
    let secondPartner = tokens.slice(0, 2).join(' ');
    let club = tokens.slice(2).join(' ');
    if (!club && tokens.length >= 4) {
      secondPartner = tokens.slice(0, 3).join(' ');
      club = tokens.slice(3).join(' ');
    }
    if (!club) continue;

    const gender = /Girls/i.test(category) ? 'F' : /Boys/i.test(category) ? 'M' : genderHint;
    out.push(...makeRelayAthleteRows(
      place, null, bib, firstPartner, secondPartner, club,
      'Final', time, gender, category
    ).map(r => ({ ...r, relayFinal: true })));
  }

  return out;
}

// Coordinate-aware parser for the simple final layout. It keeps the PDF's
// x-positions so the club boundary is determined by the actual Club column,
// not by a hard-coded school list or athlete-name list.
async function parseSimpleRelayFinalPdfCoordinates(buffer, genderHint = null, fieldHint = null) {
  try {
    const options = {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false });
        const items = (content.items || [])
          .map(item => {
            const t = clean(item.str);
            const tr = item.transform || [];
            return {
              text: t,
              x: Number(tr[4]) || 0,
              y: Number(tr[5]) || 0,
              width: Number(item.width) || 0
            };
          })
          .filter(x => x.text);

        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        const yTolerance = 3;
        for (const item of items) {
          let line = lines.find(l => Math.abs(l.y - item.y) <= yTolerance);
          if (!line) {
            line = { y: item.y, items: [] };
            lines.push(line);
          }
          line.items.push(item);
        }
        lines.sort((a, b) => b.y - a.y);
        return JSON.stringify(lines.map(l => ({
          y: l.y,
          items: l.items.sort((a, b) => a.x - b.x)
        })));
      }
    };

    const parsed = await pdfParse(buffer, options);
    const raw = String(parsed.text || '').trim();
    if (!raw) return [];

    let pageLines;
    try {
      pageLines = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(pageLines)) return [];

    const header = pageLines.find(line => {
      const s = line.items.map(i => i.text).join(' ');
      return /\bPos\b/i.test(s) && /\bNo\.?\b/i.test(s) &&
        /\bFirst\s+Name\b/i.test(s) && /\bLast\s+Name\b/i.test(s) &&
        /\bClub\b/i.test(s) && /\bCategory\b/i.test(s) && /\bTotal\s+Tm\b/i.test(s);
    });
    if (!header) return [];

    const findX = (re, fromX = -Infinity) => {
      const item = header.items.find(i => i.x >= fromX && re.test(i.text));
      return item ? item.x : null;
    };

    const posX = findX(/^Pos$/i);
    const noX = findX(/^No\.?$/i, posX ?? -Infinity);
    const firstX = findX(/^First(?:\s+Name)?$/i, noX ?? -Infinity) ?? findX(/^First$/i, noX ?? -Infinity);
    const lastX = findX(/^Last(?:\s+Name)?$/i, firstX ?? -Infinity) ?? findX(/^Last$/i, firstX ?? -Infinity);
    const clubX = findX(/^Club$/i, Math.max(firstX ?? -Infinity, lastX ?? -Infinity));
    const categoryX = findX(/^Category$/i, clubX ?? -Infinity);
    const timeX = findX(/^Total$/i, categoryX ?? -Infinity) ?? findX(/^Tm$/i, categoryX ?? -Infinity);

    if ([posX, noX, firstX, clubX, categoryX, timeX].some(x => x == null)) return [];

    const out = [];
    for (const line of pageLines) {
      const items = line.items || [];
      const joined = items.map(i => i.text).join(' ');
      if (/\bPos\b/i.test(joined) || /\bTotal\s+Tm\b/i.test(joined)) continue;

      const posItem = items.find(i => Math.abs(i.x - posX) < 8 && /^\d+$/.test(i.text));
      const noItem = items.find(i => Math.abs(i.x - noX) < 12 && bibRe.test(i.text));
      if (!posItem || !noItem) continue;

      const inRange = (lo, hi) => items
        .filter(i => i.x >= lo - 2 && i.x < hi - 2)
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const nameArea = inRange(firstX, clubX);
      const club = inRange(clubX, categoryX);
      const category = inRange(categoryX, timeX);
      const time = items
        .filter(i => i.x >= timeX - 3)
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .trim();

      if (!nameArea.includes('& ') && !nameArea.includes(' &')) continue;
      if (!club || !category || !timeRe.test(time)) continue;

      const amp = nameArea.indexOf('&');
      if (amp < 0) continue;
      const firstPartner = nameArea.slice(0, amp).trim();
      const secondPartner = nameArea.slice(amp + 1).trim();
      if (!firstPartner || !secondPartner) continue;

      const gender = /Girls/i.test(category) ? 'F' : /Boys/i.test(category) ? 'M' : genderHint;
      out.push(...makeRelayAthleteRows(
        posItem.text, null, noItem.text, firstPartner, secondPartner,
        club, 'Final', time, gender, category || fieldHint || ''
      ).map(r => ({ ...r, relayFinal: true })));
    }
    return out;
  } catch {
    return [];
  }
}

function parseRelayText(text, genderHint = null, fieldHint = null) {
  const out = [];
  const hintedGender = genderHint ? String(genderHint).toUpperCase() : null;

  for (const raw of String(text || '').split(/\r?\n/)) {
    const s = clean(raw);
    if (!s || /^(?:place|pos|rank)\b/i.test(s) || /^=+/.test(s)) continue;

    const tm = s.match(/(\d{1,3}:\d{2}(?:\.\d+)?)$/);
    if (!tm) continue;

    const prefix = clean(s.slice(0, tm.index));
    const m = prefix.match(/^(\d+)\s+(?:(\d+)\s+)?(?:(\d+)\s+)?(.+)$/);
    if (!m) continue;

    const place = Number(m[1]);
    if (!Number.isFinite(place)) continue;

    let body = clean(m[4]);
    if (!body || !/[A-Za-z]/.test(body)) continue;

    // Remove trailing lap/split times when pdf-parse keeps them on the row.
    body = body.replace(/(?:\s+\d{1,3}:\d{2}(?:\.\d+)?)+$/g, '').trim();
    if (!body) continue;

    const bib = m[3] || m[2] || null;
    const n = splitName(body);

    out.push({
      firstName: n.firstName,
      lastName: n.lastName,
      name: body,
      team: '',
      school: '',
      class: fieldHint || '',
      field: fieldHint || '',
      city: '',
      gender: hintedGender,
      age: null,
      bib,
      place,
      time: tm[1],
      timeSeconds: timeSec(tm[1]),
      sourceAthleteId: null,
      relay: true
    });
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
  const resultLinks = parseLinks(html).filter(link => /\bresults?\b/i.test(link.text) && !/\bstart\s*list\b/i.test(link.text));

  return {
    id: String(id),
    event: title,
    raceType,
    date,
    location,
    description,
    resultLinks,
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
 * Starts at RaceKey 1667 by default.
 *
 * This includes the earlier races while avoiding
 * the older RaceKeys below 1667.
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
async function getResultLinks(page) {
  // Playwright Page has $$eval, while Locator has evaluateAll.
  // Use $$eval here because this function operates on the Page object.
  return page.$$eval('a', (anchors) => {
    const out = [];
    for (const a of anchors) {
      const text = (a.textContent || '').trim();
      if (!/\bresults?\b/i.test(text) || /\bstart\s*list\b/i.test(text)) continue;
      const values = [a.href || '', a.getAttribute('href') || '', a.getAttribute('onclick') || ''];
      const urls = [];
      for (const value of values) {
        const decoded = String(value).replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');
        if (/^https?:\/\//i.test(decoded)) urls.push(decoded);
        for (const m of decoded.matchAll(/['"]([^'"]+\.(?:pdf|txt)(?:\?[^'"]*)?)['"]/gi)) {
          try { urls.push(new URL(m[1], location.href).href); } catch {}
        }
        if (decoded && !/^javascript:/i.test(decoded) && !/^(?:#|mailto:|tel:)/i.test(decoded)) {
          try { const u = new URL(decoded, location.href); if (/^https?:/i.test(u.href)) urls.push(u.href); } catch {}
        }
      }
      const href = [...new Set(urls)][0];
      if (href) out.push({ text, href });
    }
    return out;
  });
}

async function parseResultResource(url, linkText, visited = new Set(), depth = 0, debug = false) {
  if (!url || visited.has(url) || depth > 1) return [];
  visited.add(url);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)',
        'Accept': 'text/html,application/pdf,text/plain,*/*'
      }
    });
    if (!response.ok) return [];
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (debug) console.log(`  RESULT DEBUG: ${linkText} | content-type=${type || 'unknown'} | url=${url}`);
    const isPdf = type.includes('application/pdf') || /\.pdf(?:$|\?)/i.test(url);
    const isText = type.includes('text/plain') || /\.txt(?:$|\?)/i.test(url);

    if (isPdf) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (debug) console.log(`  RESULT DEBUG: PDF bytes=${buffer.length}`);
      const parsed = await pdfParse(buffer);
      const combinedHintText = `${linkText} ${parsed.text}`;
      const genderHint = inferGenderFromText(combinedHintText);
      const fieldHint = inferFieldFromText(parsed.text) || clean(linkText);

      const rows = parseText(parsed.text, genderHint, fieldHint);
      if (debug) console.log(`  RESULT DEBUG: normal parser=${rows.length}, extracted chars=${(parsed.text || '').length}`);
      if (rows.length) return rows;

      // First try the normal relay parsers.
      const relayRows = parseRelayPdfText(parsed.text, genderHint, fieldHint);
      if (debug) console.log(`  RESULT DEBUG: relay-line parser=${relayRows.length}`);
      if (relayRows.length) return relayRows;

      const relayTextRows = parseRelayText(parsed.text, genderHint, fieldHint);
      if (debug) console.log(`  RESULT DEBUG: loose relay parser=${relayTextRows.length}`);
      if (relayTextRows.length) return relayTextRows;

      const relayFinalRows = parseRelayFinalPdfText(parsed.text, genderHint, fieldHint);
      if (debug) console.log(`  RESULT DEBUG: final relay parser=${relayFinalRows.length}`);
      if (relayFinalRows.length) return relayFinalRows;

      // Finally rebuild the PDF as visual lines using text-item coordinates.
      // This handles PDFs whose internal text order differs from what a
      // person sees on screen.
      const coordinateText = await pdfTextByCoordinates(buffer);
      if (debug) console.log(`  RESULT DEBUG: coordinate text chars=${coordinateText.length}`);
      if (!coordinateText) return [];
      const coordinateGender = inferGenderFromText(`${linkText} ${coordinateText}`);
      const coordinateField = inferFieldFromText(coordinateText) || clean(linkText);
      const coordinateRows = parseRelayRowsFromLines(coordinateText, coordinateGender, coordinateField);
      let coordinateFallback = coordinateRows.length ? coordinateRows : parseRelayPdfText(coordinateText, coordinateGender, coordinateField);
      if (!coordinateFallback.length) coordinateFallback = parseRelayFinalPdfText(coordinateText, coordinateGender, coordinateField);

      // The MEC team-relay finals use a simpler table header:
      // Pos | No. | First Name | Last Name | Club | Category | Total Tm
      // Use the actual PDF column x-positions to separate the two athletes
      // from the club. No race ID, school, or athlete name is hard-coded.
      if (!coordinateFallback.length) {
        const structuredFinalRows = await parseSimpleRelayFinalPdfCoordinates(
          buffer, coordinateGender, coordinateField
        );
        if (debug) console.log(`  RESULT DEBUG: structured final parser=${structuredFinalRows.length}`);
        if (structuredFinalRows.length) coordinateFallback = structuredFinalRows;
      }

      if (debug) {
        console.log(`  RESULT DEBUG: coordinate parser=${coordinateRows.length}, coordinate fallback=${coordinateFallback.length}`);
        if (!coordinateRows.length && coordinateText) console.log(`  RESULT DEBUG: coordinate sample=${JSON.stringify(coordinateText.slice(0, 1200))}`);
      }
      return coordinateFallback;
    }

    const body = await response.text();
    if (isText) {
      const genderHint = inferGenderFromText(`${linkText} ${body}`);
      const fieldHint = inferFieldFromText(body) || clean(linkText);
      const rows = parseText(body, genderHint, fieldHint);
      return rows.length ? rows : parseRelayText(body, genderHint, fieldHint);
    }

    const nested = parseLinks(body).filter(link => /\bresults?\b/i.test(link.text) && !/\bstart\s*list\b/i.test(link.text));
    const all = [];
    for (const child of nested) all.push(...await parseResultResource(child.href, child.text || linkText, visited, depth + 1));
    return all;
  } catch {
    return [];
  }
}

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

    console.log('  FIELD FILTER: scraping the complete result grid (new BJV/BVAR/GJV/GVAR and legacy grade-based fields)');
    await scrapeAllGridPages();


    // Result documents are not always named .pdf/.txt in their URL. Use the
    // visible result links and inspect Content-Type, following one intermediate
    // ASP.NET result page when necessary.
    const resultLinks = await getResultLinks(page);
    if (resultLinks.length) {
      console.log(`  RESULT LINKS: ${resultLinks.length}`);
      for (const link of resultLinks) console.log(`    - ${link.text} -> ${link.href}`);
    }
    const visitedResources = new Set();
    for (const link of resultLinks) {
      const debug = /\brelay\b/i.test(link.text);
      const rows = await parseResultResource(link.href, link.text, visitedResources, 0, debug);
      console.log(`  RESULT LINK: ${link.text} -> ${rows.length} parsed rows`);
      if (rows.length) {
        addRows(rows, link.href);
        stats.pdf++;
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

async function readPreviousRows(out) {
  try {
    const text = await fs.readFile(out, 'utf8');
    const data = JSON.parse(text);

    if (!data || !Array.isArray(data.matches)) {
      return [];
    }

    return data.matches.filter(
      row => row && typeof row === 'object'
    );
  } catch {
    return [];
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
   * Preserve the existing results file.
   *
   * The scraper now starts at RaceKey 1612, but we also keep every
   * previously scraped row that the new run does not reproduce. This
   * prevents a temporary site/parser failure from deleting races that
   * were already working.
   */
  const previousRows = await readPreviousRows(a.out);

  console.log(
    `EXISTING RESULTS: ${previousRows.length} rows loaded for preservation.`
  );

  /*
   * STEP 1
   *
   * Discover RaceKeys beginning at 1612.
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

  const raceIdsWritten =
    new Set();

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

            const raceId = String(row.sourceRaceId || '');
            if (raceId && !raceIdsWritten.has(raceId)) {
              raceIdsWritten.add(raceId);
              raceCount++;
            }
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
   * Merge back any old rows that the new run did not reproduce.
   *
   * This is the important safety net: changing the starting RaceKey,
   * a temporary Endurance Promotions failure, or a parser regression
   * cannot delete a race that was already in results.json.
   *
   * New rows are kept as the primary data. Old rows are appended only
   * when their exact row key was not produced by the new run.
   */
  const seenAfterScrape = seen;

  let preservedRows = 0;

  for (const oldRow of previousRows) {
    const key = rowKey(oldRow);

    if (seenAfterScrape.has(key)) {
      continue;
    }

    seenAfterScrape.add(key);

    if (!firstRow) {
      await output.write(',\n');
    }

    await output.write(
      '    ' + JSON.stringify(oldRow)
    );

    firstRow = false;
    totalRows++;
    preservedRows++;

    const raceId = String(oldRow.sourceRaceId || '');
    if (raceId && !raceIdsWritten.has(raceId)) {
      raceIdsWritten.add(raceId);
      raceCount++;
    }
  }

  console.log(
    `PRESERVED EXISTING RESULTS: ${preservedRows} rows retained from the previous file.`
  );

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
