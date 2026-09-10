#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const process = require('node:process');
const pdfParse = require('pdf-parse');

const BASE = 'https://www.endurancepromotions.com';
const RESULTS_URL = `${BASE}/Results.aspx`;

const DEFAULTS = {
  sport: 'nordic',
  out: path.resolve(process.cwd(), 'public', 'results.json'),
  concurrency: 12,
  timeout: 20000,
  blockSize: 250,
  emptyBlocks: 2,
  maxId: 10000
};

const NORDIC_KEYWORDS = [
  'nordic',
  'skiing',
  'ski',
  'xc',
  'cross country',
  'cross-country',
  'loppet',
  'birkie',
  'sisu',
  'vakava',
  'rollerski',
  'roller ski',
  'skate',
  'classic',
  'pursuit'
];

function args(a) {
  const o = { ...DEFAULTS };

  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--sport') {
      o.sport = a[++i] || o.sport;
    } else if (a[i] === '--out') {
      o.out = path.resolve(process.cwd(), a[++i] || o.out);
    } else if (a[i] === '--concurrency') {
      o.concurrency = Math.max(1, Number(a[++i]) || 1);
    } else if (a[i] === '--timeout') {
      o.timeout = Math.max(1000, Number(a[++i]) || 20000);
    } else if (a[i] === '--max-id') {
      o.maxId = Math.max(1, Number(a[++i]) || 10000);
    } else if (a[i] === '--help' || a[i] === '-h') {
      console.log(
        'node scraper.cjs --sport nordic --out public/results.json'
      );
      process.exit(0);
    }
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
  const p = clean(v).split(':').map(Number);

  if (!p.length || p.some(Number.isNaN)) {
    return null;
  }

  if (p.length === 2) {
    return p[0] * 60 + p[1];
  }

  if (p.length === 3) {
    return p[0] * 3600 + p[1] * 60 + p[2];
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
  return norm(v).replace(/[^a-z0-9]/g, '');
}

function looksNordic(r) {
  const t = norm(
    `${r.event} ${r.location} ${r.raceType} ${r.description}`
  );

  return (
    norm(r.raceType) === 'skiing' ||
    NORDIC_KEYWORDS.some(k => t.includes(norm(k)))
  );
}

function parseTables(html) {
  const tables = [];

  for (const tm of String(html).matchAll(
    /<table\b[^>]*>([\s\S]*?)<\/table>/gi
  )) {
    const rows = [];

    for (const rm of tm[1].matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )) {
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

  for (const m of String(html).matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
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

function findHeader(rows, required) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const ks = rows[i].map(headerKey);

    if (
      required.every(x =>
        ks.includes(headerKey(x))
      )
    ) {
      return i;
    }
  }

  return -1;
}

function rowsFromTable(rows) {
  const hi = findHeader(rows, [
    'First Name',
    'Last Name',
    'Total Time'
  ]);

  if (hi < 0) {
    return [];
  }

  const h = {};

  rows[hi].forEach((v, i) => {
    h[headerKey(v)] = i;
  });

  const get = (r, ...names) => {
    for (const n of names) {
      const i = h[headerKey(n)];

      if (i !== undefined) {
        return clean(r[i]);
      }
    }

    return '';
  };

  const out = [];

  for (const r of rows.slice(hi + 1)) {
    const first = get(r, 'First Name');
    const last = get(r, 'Last Name');
    const time = get(r, 'Total Time', 'Time');

    if ((!first && !last) || !time) {
      continue;
    }

    const place = get(r, 'Pos', 'Place');
    const bib = get(r, 'Bib #', 'Bib');

    out.push({
      firstName: first,
      lastName: last,
      name: clean(`${first} ${last}`),
      team: get(r, 'Team', 'School'),
      school: get(r, 'School', 'Team'),
      class: get(r, 'Class'),
      field: get(r, 'Field'),
      city: get(r, 'City'),
      gender: get(r, 'Gender') || null,
      age: get(r, 'Age') || null,
      bib: bib || null,
      place: Number(place) || null,
      time,
      timeSeconds: timeSec(time),
      sourceAthleteId:
        get(r, 'ResultsKey') || null
    });
  }

  return out;
}

function parseText(text) {
  const out = [];

  for (const raw of String(text || '').split(/\r?\n/)) {
    const s = clean(raw);

    if (
      !s ||
      /^place\s+bib/i.test(s) ||
      /^=+/.test(s)
    ) {
      continue;
    }

    const m = s.match(
      /^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/
    );

    if (!m) {
      continue;
    }

    const n = splitName(m[3]);

    out.push({
      firstName: n.firstName,
      lastName: n.lastName,
      name: n.firstName + ' ' + n.lastName,
      team: '',
      school: '',
      class: '',
      field: '',
      city: '',
      gender: null,
      age: null,
      bib: m[2],
      place: Number(m[1]),
      time: m[4],
      timeSeconds: timeSec(m[4]),
      sourceAthleteId: null
    });
  }

  return out;
}

function raceMeta(html, id) {
  const text = strip(html);

  const title =
    (text.match(
      /Individual Results for\s+([^\n]+)/i
    ) || [])[1] || '';

  const raceType =
    (text.match(
      /Race Type\s*\|\s*([^\n|]+)/i
    ) || [])[1] || '';

  const date =
    (text.match(
      /Race Date\s*\|\s*([^\n|]+)/i
    ) || [])[1] || '';

  const location =
    (text.match(
      /Race Location\s*\|\s*([^\n|]+)/i
    ) || [])[1] || '';

  const desc =
    (text.match(
      /Race Description\s*\|\s*([\s\S]*?)(?:Search by|Filter by|ResultsKey|$)/i
    ) || [])[1] || '';

  return {
    id: String(id),
    event: clean(title),
    raceType: clean(raceType),
    date: clean(date),
    location: clean(location),
    description: clean(desc)
  };
}

async function fetchText(url, timeout = 20000, attempt = 0) {
  const c = new AbortController();

  const t = setTimeout(
    () => c.abort(),
    timeout
  );

  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)'
      }
    });

    if (!r.ok) {
      return {
        status: r.status,
        url,
        body: ''
      };
    }

    return {
      status: r.status,
      url,
      body: await r.text()
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
      error: e.message
    };
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;

      if (i >= items.length) {
        return;
      }

      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          limit,
          items.length
        )
      },
      worker
    )
  );

  return out;
}

async function discoverByIds(args) {
  console.log(
    'DISCOVERY: Results grid does not expose race links to the scraper. Switching to automatic RaceKey discovery.'
  );

  let start = 1;
  let end = DEFAULTS.blockSize;
  let empty = 0;

  const found = new Map();

  while (
    start <= args.maxId &&
    empty < args.emptyBlocks
  ) {
    const ids = [];

    for (
      let i = start;
      i < Math.min(end, args.maxId + 1);
      i++
    ) {
      ids.push(i);
    }

    const res = await mapLimit(
      ids,
      args.concurrency,
      async id => {
        const u =
          `${BASE}/ResultDetails.aspx?id=${id}`;

        const r = await fetchText(
          u,
          args.timeout
        );

        if (
          r.status !== 200 ||
          !r.body
        ) {
          return null;
        }

        const race = raceMeta(
          r.body,
          id
        );

        if (
          !race.event &&
          !race.raceType &&
          !r.body.includes(
            'Result Details'
          )
        ) {
          return null;
        }

        return {
          ...race,
          url: u,
          html: r.body
        };
      }
    );

    const hits = res.filter(Boolean);

    for (const r of hits) {
      found.set(r.id, r);
    }

    console.log(
      `DISCOVERY: probed RaceKey ${start}-${Math.min(
        end - 1,
        args.maxId
      )} -> ${hits.length} valid race pages (total ${found.size})`
    );

    if (hits.length === 0) {
      empty++;
    } else {
      empty = 0;
    }

    start = end;
    end += DEFAULTS.blockSize;
  }

  return [...found.values()];
}

async function processRace(
  race,
  args,
  stats
) {
  if (!looksNordic(race)) {
    return [];
  }

  stats.nordic++;

  const all = [];

  const addRows = (rows, src) => {
    for (const row of rows) {
      all.push({
        ...row,
        event: race.event,
        raceDate: race.date,
        raceLocation: race.location,
        raceType: race.raceType,
        sourceRaceId: race.id,
        sourceRaceUrl: race.url,
        sourceResultUrl:
          src || race.url
      });
    }
  };

  // Main grid and linked files/pages.
  const pages = [race.url];
  const seenPages = new Set();
  let fileLinks = [];

  for (
    let pageNo = 1;
    pageNo <= 200;
    pageNo++
  ) {
    const u = new URL(race.url);

    if (pageNo > 1) {
      u.searchParams.set(
        'ctl00_cphMain_grdIndividualResultsChangePage',
        `${pageNo}_50`
      );
    }

    const r =
      pageNo === 1
        ? {
            status: 200,
            body: race.html
          }
        : await fetchText(
            u.href,
            args.timeout
          );

    if (!r.body) {
      break;
    }

    const tables = parseTables(r.body);

    let rows = 0;

    for (const t of tables) {
      const got = rowsFromTable(t);

      if (got.length) {
        addRows(got, u.href);
        rows += got.length;
      }
    }

    if (
      rows === 0 &&
      pageNo > 1
    ) {
      break;
    }

    const links = parseLinks(r.body);

    for (const l of links) {
      if (
        /\.(txt|pdf)(\?|$)/i.test(
          l.href
        ) ||
        /ResultDetails\.aspx/i.test(
          l.href
        )
      ) {
        fileLinks.push(l);
      }
    }

    seenPages.add(u.href);

    if (pageNo === 1) {
      const m = strip(r.body).match(
        /(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i
      );

      if (!m) {
        break;
      }

      if (Number(m[2]) <= 1) {
        break;
      }
    } else if (rows < 1) {
      break;
    }
  }

  const uniqueLinks = [
    ...new Map(
      fileLinks.map(x => [
        x.href,
        x
      ])
    ).values()
  ];

  for (const l of uniqueLinks) {
    if (
      /ResultDetails\.aspx/i.test(
        l.href
      )
    ) {
      if (
        seenPages.has(l.href)
      ) {
        continue;
      }

      const rr = await fetchText(
        l.href,
        args.timeout
      );

      if (rr.body) {
        const child = raceMeta(
          rr.body,
          new URL(l.href).searchParams.get(
            'id'
          ) || race.id
        );

        if (looksNordic(child)) {
          const tabs =
            parseTables(rr.body);

          for (const t of tabs) {
            addRows(
              rowsFromTable(t),
              l.href
            );
          }

          stats.childPages++;
        }
      }

      continue;
    }

    const rr = await fetchText(
      l.href,
      args.timeout
    );

    if (!rr.body) {
      continue;
    }

    if (/\.txt/i.test(l.href)) {
      const got = parseText(
        rr.body
      );

      if (got.length) {
        addRows(
          got,
          l.href
        );
        stats.txt++;
      }
    } else if (/\.pdf/i.test(l.href)) {
      try {
        const buf = Buffer.from(
          await (
            await fetch(l.href, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0'
              }
            })
          ).arrayBuffer()
        );

        const parsed =
          await pdfParse(buf);

        const got = parseText(
          parsed.text
        );

        if (got.length) {
          addRows(
            got,
            l.href
          );
          stats.pdf++;
        }
      } catch {
        // Ignore individual PDF failures.
      }
    }
  }

  if (all.length) {
    stats.racesWithRows++;
  }

  return all;
}

function dedupe(rows) {
  const s = new Set();

  return rows.filter(r => {
    const k = [
      r.sourceAthleteId || '',
      r.sourceResultUrl || '',
      r.bib || '',
      norm(r.firstName),
      norm(r.lastName),
      r.time || '',
      r.place || ''
    ].join('|');

    if (s.has(k)) {
      return false;
    }

    s.add(k);
    return true;
  });
}

async function safeWrite(
  out,
  payload
) {
  let prev = null;

  try {
    prev = JSON.parse(
      await fs.readFile(
        out,
        'utf8'
      )
    );
  } catch {
    // No previous file.
  }

  if (
    payload.rowCount === 0 &&
    prev?.rowCount > 0
  ) {
    throw new Error(
      `Refusing to overwrite ${out}: scraper returned 0 rows while previous file contains ${prev.rowCount}.`
    );
  }

  await fs.mkdir(
    path.dirname(out),
    { recursive: true }
  );

  const tmp = out + '.tmp';

  await fs.writeFile(
    tmp,
    JSON.stringify(
      payload,
      null,
      2
    ) + '\n'
  );

  await fs.rename(
    tmp,
    out
  );
}

async function main() {
  const a = args(
    process.argv.slice(2)
  );

  console.log(
    'Endurance Promotions automatic Nordic scraper v4'
  );

  console.log(
    'Discovery: live Results diagnostics + automatic RaceKey discovery + result grids/files'
  );

  const races =
    await discoverByIds(a);

  console.log(
    `DISCOVERY: ${races.length} race pages discovered automatically.`
  );

  const stats = {
    nordic: 0,
    racesWithRows: 0,
    txt: 0,
    pdf: 0,
    childPages: 0
  };

  const all = [];

  for (
    let i = 0;
    i < races.length;
    i++
  ) {
    const r = races[i];

    if (!looksNordic(r)) {
      continue;
    }

    console.log(
      `RACE ${i + 1}/${races.length}: ${r.event} | ${r.date} | ${r.url}`
    );

    try {
      all.push(
        ...await processRace(
          r,
          a,
          stats
        )
      );
    } catch (e) {
      console.warn(
        `RACE ERROR ${r.id}: ${e.message}`
      );
    }
  }

  const matches =
    dedupe(all);

  const payload = {
    generatedAt:
      new Date().toISOString(),

    source: BASE,

    sport: a.sport,

    raceCount:
      new Set(
        matches.map(
          x => x.sourceRaceId
        )
      ).size,

    rowCount:
      matches.length,

    errorCount: 0,

    diagnostics: {
      racePagesDiscovered:
        races.length,

      nordicRaces:
        stats.nordic,

      nordicRacesWithRows:
        stats.racesWithRows,

      resultTxtFiles:
        stats.txt,

      resultPdfFiles:
        stats.pdf,

      childResultPages:
        stats.childPages
    },

    matches
  };

  console.log(
    'DIAGNOSTICS:',
    JSON.stringify(
      payload.diagnostics
    )
  );

  console.log(
    `OUTPUT: ${payload.raceCount} races, ${payload.rowCount} rows`
  );

  await safeWrite(
    a.out,
    payload
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
