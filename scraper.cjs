#!/usr/bin/env node

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const pdfParse = require('pdf-parse');

const BASE = 'https://www.endurancepromotions.com';

const DEFAULTS = {
  sport: 'nordic',
  out: path.resolve(process.cwd(), 'public', 'results.json'),

  // Keep this fairly low. The website doesn't need 16+ simultaneous requests.
  concurrency: 4,

  timeout: 20000,

  // RaceKey discovery
  blockSize: 250,
  emptyBlocks: 8,
  maxId: 3000,

  // Process only this many races before allowing cleanup.
  batchSize: 10
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

function looksNordic(r) {
  const t = norm(
    `${r.event} ${r.location} ${r.raceType} ${r.description}`
  );

  return (
    norm(r.raceType) === 'skiing' ||
    NORDIC_KEYWORDS.some(k =>
      t.includes(norm(k))
    )
  );
}

function args(a) {

/* ============================================================
   ARGUMENTS
   ============================================================ */

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

--concurrency 8
--timeout 20000
--max-id 3000
--batch-size 20
`);

      process.exit(0);
    }
  }

  return o;
}

/* ============================================================
   STRING HELPERS
   ============================================================ */

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

/* ============================================================
   NORDIC FILTER
   ============================================================ */

function looksNordic(r) {
  const t = norm(
    `${r.event} ${r.location} ${r.raceType} ${r.description}`
  );

  return (
    norm(r.raceType) === 'skiing' ||
    NORDIC_KEYWORDS.some(k =>
      t.includes(norm(k))
    )
  );
}

/* ============================================================
   HTML PARSING
   ============================================================ */

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
  for (
    let i = 0;
    i < Math.min(rows.length, 15);
    i++
  ) {
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

/* ============================================================
   RESULT TABLE PARSER
   ============================================================ */

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
    const first = get(
      r,
      'First Name'
    );

    const last = get(
      r,
      'Last Name'
    );

    const time = get(
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

    const place = get(
      r,
      'Pos',
      'Place'
    );

    const bib = get(
      r,
      'Bib #',
      'Bib'
    );

    out.push({
      firstName: first,
      lastName: last,

      name: clean(
        `${first} ${last}`
      ),

      team: get(
        r,
        'Team',
        'School'
      ),

      school: get(
        r,
        'School',
        'Team'
      ),

      class: get(
        r,
        'Class'
      ),

      field: get(
        r,
        'Field'
      ),

      city: get(
        r,
        'City'
      ),

      gender:
        get(r, 'Gender') ||
        null,

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
        get(r, 'ResultsKey') ||
        null
    });
  }

  return out;
}

/* ============================================================
   TEXT RESULT PARSER
   ============================================================ */

function parseText(text) {
  const out = [];

  for (
    const raw of String(text || '').split(/\r?\n/)
  ) {
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

      name:
        n.firstName +
        ' ' +
        n.lastName,

      team: '',
      school: '',
      class: '',
      field: '',
      city: '',
      gender: null,
      age: null,

      bib: m[2],

      place:
        Number(m[1]),

      time: m[4],

      timeSeconds:
        timeSec(m[4]),

      sourceAthleteId: null
    });
  }

  return out;
}

/* ============================================================
   RACE METADATA
   ============================================================ */

function raceMeta(html, id) {
  const text = strip(html);

  const title =
    (
      text.match(
        /Individual Results for\s+([^\n]+)/i
      ) || []
    )[1] || '';

  const raceType =
    (
      text.match(
        /Race Type\s*\|\s*([^\n|]+)/i
      ) || []
    )[1] || '';

  const date =
    (
      text.match(
        /Race Date\s*\|\s*([^\n|]+)/i
      ) || []
    )[1] || '';

  const location =
    (
      text.match(
        /Race Location\s*\|\s*([^\n|]+)/i
      ) || []
    )[1] || '';

  const desc =
    (
      text.match(
        /Race Description\s*\|\s*([\s\S]*?)(?:Search by|Filter by|ResultsKey|$)/i
      ) || []
    )[1] || '';

  return {
    id: String(id),
    event: clean(title),
    raceType: clean(raceType),
    date: clean(date),
    location: clean(location),
    description: clean(desc)
  };
}

/* ============================================================
   HTTP
   ============================================================ */

async function fetchText(
  url,
  timeout = 20000,
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
      error: e.message
    };

  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   CONCURRENCY LIMIT
   ============================================================ */

async function mapLimit(
  items,
  limit,
  fn
) {
  const out =
    new Array(items.length);

  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;

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

/* ============================================================
   RACEKEY DISCOVERY
   ============================================================ */

async function discoverByIds(a) {
  console.log(
    'DISCOVERY: Starting automatic RaceKey discovery.'
  );

  console.log(
    `DISCOVERY: Searching RaceKey 1-${a.maxId}`
  );

  let start = 1;

  let end =
    Math.min(
      a.blockSize,
      a.maxId
    );

  let emptyBlocks = 0;

  const found =
    new Map();

  while (
    start <= a.maxId &&
    emptyBlocks < a.emptyBlocks
  ) {
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
           * A valid ResultDetails page should
           * have some recognizable race information.
           */
          if (
            !race.event &&
            !race.raceType &&
            !response.body.includes(
              'Result Details'
            )
          ) {
            return null;
          }

          /*
           * IMPORTANT:
           *
           * We DO NOT store response.body.
           *
           * Only metadata and URL are kept.
           */
          return {
            ...race,
            url
          };
        }
      );

    const hits =
      results.filter(Boolean);

    for (const race of hits) {
      found.set(
        race.id,
        race
      );
    }

    console.log(
      `DISCOVERY: RaceKey ${start}-${end} -> ${hits.length} valid pages (total ${found.size})`
    );

    if (
      hits.length === 0
    ) {
      emptyBlocks++;
    } else {
      emptyBlocks = 0;
    }

    start =
      end + 1;

    end =
      Math.min(
        end + a.blockSize,
        a.maxId
      );
  }

  return [
    ...found.values()
  ];
}

/* ============================================================
   PROCESS ONE RACE
   ============================================================ */

async function processRace(
  race,
  a,
  stats
) {
  if (
    !looksNordic(race)
  ) {
    return [];
  }

  stats.nordic++;

  const rows = [];

  const addRows = (
    parsedRows,
    sourceUrl
  ) => {
    for (
      const row of parsedRows
    ) {
      rows.push({
        ...row,

        event:
          race.event,

        raceDate:
          race.date,

        raceLocation:
          race.location,

        raceType:
          race.raceType,

        sourceRaceId:
          race.id,

        sourceRaceUrl:
          race.url,

        sourceResultUrl:
          sourceUrl ||
          race.url
      });
    }
  };

  const seenPages =
    new Set();

  const fileLinks =
    new Map();

  /*
   * Download result pages one at a time.
   *
   * This avoids having many large HTML documents
   * sitting in memory simultaneously.
   */
  for (
    let pageNo = 1;
    pageNo <= 200;
    pageNo++
  ) {
    const url =
      new URL(
        race.url
      );

    if (
      pageNo > 1
    ) {
      url.searchParams.set(
        'ctl00_cphMain_grdIndividualResultsChangePage',
        `${pageNo}_50`
      );
    }

    const response =
      await fetchText(
        url.href,
        a.timeout
      );

    if (
      !response.body
    ) {
      break;
    }

    const tables =
      parseTables(
        response.body
      );

    let rowsFound = 0;

    for (
      const table of tables
    ) {
      const parsed =
        rowsFromTable(
          table
        );

      if (
        parsed.length
      ) {
        addRows(
          parsed,
          url.href
        );

        rowsFound +=
          parsed.length;
      }
    }

    /*
     * Find links to TXT/PDF/child result pages.
     */
    const links =
      parseLinks(
        response.body
      );

    for (
      const link of links
    ) {
      if (
        /\.(txt|pdf)(\?|$)/i.test(
          link.href
        ) ||
        /ResultDetails\.aspx/i.test(
          link.href
        )
      ) {
        fileLinks.set(
          link.href,
          link
        );
      }
    }

    seenPages.add(
      url.href
    );

    /*
     * If the first page doesn't tell us that
     * there are multiple pages, stop.
     */
    if (
      pageNo === 1
    ) {
      const pageInfo =
        strip(
          response.body
        ).match(
          /(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i
        );

      if (
        !pageInfo ||
        Number(pageInfo[2]) <= 1
      ) {
        break;
      }
    }

    /*
     * If a later page produces no results,
     * stop requesting pages.
     */
    if (
      pageNo > 1 &&
      rowsFound === 0
    ) {
      break;
    }
  }

  /*
   * Process linked result pages/files.
   */
  for (
    const link of fileLinks.values()
  ) {

    /*
     * Child ResultDetails page
     */
    if (
      /ResultDetails\.aspx/i.test(
        link.href
      )
    ) {

      if (
        seenPages.has(
          link.href
        )
      ) {
        continue;
      }

      const response =
        await fetchText(
          link.href,
          a.timeout
        );

      if (
        response.body
      ) {
        const childId =
          new URL(
            link.href
          ).searchParams.get(
            'id'
          ) || race.id;

        const child =
          raceMeta(
            response.body,
            childId
          );

        if (
          looksNordic(child)
        ) {
          const tables =
            parseTables(
              response.body
            );

          for (
            const table of tables
          ) {
            const parsed =
              rowsFromTable(
                table
              );

            if (
              parsed.length
            ) {
              addRows(
                parsed,
                link.href
              );
            }
          }

          stats.childPages++;
        }
      }

      continue;
    }

    /*
     * TXT or PDF result file
     */
    const response =
      await fetchText(
        link.href,
        a.timeout
      );

    if (
      !response.body
    ) {
      continue;
    }

    if (
      /\.txt/i.test(
        link.href
      )
    ) {
      const parsed =
        parseText(
          response.body
        );

      if (
        parsed.length
      ) {
        addRows(
          parsed,
          link.href
        );

        stats.txt++;
      }

    } else if (
      /\.pdf/i.test(
        link.href
      )
    ) {

      try {
        const pdfResponse =
          await fetch(
            link.href,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (compatible; MyNordicRaceResults/1.0)'
              }
            }
          );

        if (
          !pdfResponse.ok
        ) {
          continue;
        }

        const buffer =
          Buffer.from(
            await pdfResponse.arrayBuffer()
          );

        const parsedPdf =
          await pdfParse(
            buffer
          );

        const parsed =
          parseText(
            parsedPdf.text
          );

        if (
          parsed.length
        ) {
          addRows(
            parsed,
            link.href
          );

          stats.pdf++;
        }

      } catch {
        /*
         * One bad PDF should never stop
         * the entire scraper.
         */
      }
    }
  }

  if (
    rows.length
  ) {
    stats.racesWithRows++;
  }

  return rows;
}

/* ============================================================
   DUPLICATE KEY
   ============================================================ */

function rowKey(r) {
  return [
    r.sourceAthleteId || '',
    r.sourceResultUrl || '',
    r.bib || '',
    norm(r.firstName),
    norm(r.lastName),
    r.time || '',
    r.place || ''
  ].join('|');
}

/* ============================================================
   DEDUPE A BATCH
   ============================================================ */

function dedupeBatch(
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

    unique.push(row);
  }

  return unique;
}

/* ============================================================
   APPEND NDJSON
   ============================================================ */

async function appendNdjson(
  file,
  rows
) {
  if (
    !rows.length
  ) {
    return;
  }

  const handle =
    await fs.open(
      file,
      'a'
    );

  try {
    let buffer = '';

    for (
      const row of rows
    ) {
      buffer +=
        JSON.stringify(row) +
        '\n';

      /*
       * Don't build a giant string.
       */
      if (
        buffer.length >=
        1024 * 1024
      ) {
        await handle.write(
          buffer
        );

        buffer = '';
      }
    }

    if (
      buffer
    ) {
      await handle.write(
        buffer
      );
    }

  } finally {
    await handle.close();
  }
}

/* ============================================================
   BUILD FINAL JSON
   ============================================================ */

async function buildFinalJson(
  ndjsonFile,
  outputFile,
  metadata
) {
  await fs.mkdir(
    path.dirname(
      outputFile
    ),
    {
      recursive: true
    }
  );

  const tempOutput =
    outputFile +
    '.tmp';

  const output =
    fsSync.createWriteStream(
      tempOutput,
      {
        encoding: 'utf8'
      }
    );

  const write =
    chunk =>
      new Promise(
        (resolve, reject) => {

          if (
            output.write(
              chunk
            )
          ) {
            resolve();
          } else {
            output.once(
              'drain',
              resolve
            );
          }
        }
      );

  await write(
    '{\n' +

    `  "generatedAt": ${JSON.stringify(
      metadata.generatedAt
    )},\n` +

    `  "source": ${JSON.stringify(
      metadata.source
    )},\n` +

    `  "sport": ${JSON.stringify(
      metadata.sport
    )},\n` +

    `  "raceCount": ${metadata.raceCount},\n` +

    `  "rowCount": ${metadata.rowCount},\n` +

    `  "errorCount": ${metadata.errorCount},\n` +

    '  "diagnostics": ' +

    JSON.stringify(
      metadata.diagnostics,
      null,
      2
    ) +

    ',\n' +

    '  "matches": [\n'
  );

  let first =
    true;

  const input =
    fsSync.createReadStream(
      ndjsonFile,
      {
        encoding: 'utf8'
      }
    );

  let leftover =
    '';

  for await (
    const chunk of input
  ) {
    leftover += chunk;

    const lines =
      leftover.split('\n');

    leftover =
      lines.pop() || '';

    for (
      const line of lines
    ) {
      if (
        !line.trim()
      ) {
        continue;
      }

      if (
        !first
      ) {
        await write(
          ',\n'
        );
      }

      await write(
        '    ' +
        line.trim()
      );

      first = false;
    }
  }

  if (
    leftover.trim()
  ) {
    if (
      !first
    ) {
      await write(
        ',\n'
      );
    }

    await write(
      '    ' +
      leftover.trim()
    );
  }

  await write(
    '\n  ]\n}\n'
  );

  await new Promise(
    (resolve, reject) => {
      output.end(
        err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    }
  );

  await fs.rename(
    tempOutput,
    outputFile
  );
}

/* ============================================================
   PROTECT PREVIOUS GOOD RESULTS
   ============================================================ */

async function verifyPrevious(
  outputFile,
  newRowCount
) {
  let previous = null;

  try {
    previous =
      JSON.parse(
        await fs.readFile(
          outputFile,
          'utf8'
        )
      );
  } catch {
    return;
  }

  if (
    newRowCount === 0 &&
    previous?.rowCount > 0
  ) {
    throw new Error(
      `Refusing to overwrite ${outputFile}: scraper returned 0 rows while previous file contains ${previous.rowCount}.`
    );
  }
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {
  const a =
    args(
      process.argv.slice(2)
    );

  console.log(
    '=================================================='
  );

  console.log(
    'Endurance Promotions automatic Nordic scraper'
  );

  console.log(
    'Memory-safe batched version'
  );

  console.log(
    '=================================================='
  );

  console.log(
    `Batch size: ${a.batchSize}`
  );

  console.log(
    `Concurrency: ${a.concurrency}`
  );

  console.log(
    `Maximum RaceKey: ${a.maxId}`
  );

  console.log(
    `Output: ${a.out}`
  );

  console.log(
    ''
  );

  /*
   * ==========================================================
   * STEP 1: DISCOVER ALL RACES
   * ==========================================================
   */

  const races =
    await discoverByIds(a);

  console.log(
    ''
  );

  console.log(
    `DISCOVERY COMPLETE: ${races.length} race pages discovered.`
  );

  /*
   * ==========================================================
   * STEP 2: PREPARE TEMPORARY FILE
   * ==========================================================
   */

  await fs.mkdir(
    path.dirname(a.out),
    {
      recursive: true
    }
  );

  const ndjsonFile =
    a.out +
    '.ndjson.tmp';

  /*
   * Delete previous temporary file.
   */
  try {
    await fs.unlink(
      ndjsonFile
    );
  } catch {
    // Doesn't exist.
  }

  /*
   * ==========================================================
   * STEP 3: STATS
   * ==========================================================
   */

  const stats = {
    nordic: 0,
    racesWithRows: 0,
    txt: 0,
    pdf: 0,
    childPages: 0
  };

  /*
   * Only duplicate KEYS are stored in memory.
   *
   * Result objects themselves are written to disk
   * after every race.
   */
  const seen =
    new Set();

  let totalRows =
    0;

  let racesWithResults =
    0;

  /*
   * ==========================================================
   * STEP 4: PROCESS RACES IN BATCHES
   * ==========================================================
   */

  for (
    let start = 0;
    start < races.length;
    start += a.batchSize
  ) {
    const batchNumber =
      Math.floor(
        start /
        a.batchSize
      ) + 1;

    const batchEnd =
      Math.min(
        start +
        a.batchSize,
        races.length
      );

    console.log(
      ''
    );

    console.log(
      '=================================================='
    );

    console.log(
      `BATCH ${batchNumber}`
    );

    console.log(
      `Races ${start + 1}-${batchEnd} of ${races.length}`
    );

    console.log(
      '=================================================='
    );

    /*
     * IMPORTANT:
     *
     * We process each race individually.
     *
     * We do NOT use:
     *
     * all.push(...)
     *
     * for the entire scraper.
     */

    for (
      let j = start;
      j < batchEnd;
      j++
    ) {
      const race =
        races[j];

      /*
       * Skip cycling/running/etc.
       */
      if (
        !looksNordic(race)
      ) {
        continue;
      }

      console.log(
        `RACE ${j + 1}/${races.length}: ${race.event} | ${race.date} | ${race.raceType}`
      );

      try {
        const rows =
          await processRace(
            race,
            a,
            stats
          );

        /*
         * Remove duplicate rows.
         */
        const unique =
          dedupeBatch(
            rows,
            seen
          );

        /*
         * Write immediately.
         */
        if (
          unique.length
        ) {
          await appendNdjson(
            ndjsonFile,
            unique
          );

          totalRows +=
            unique.length;

          racesWithResults++;
        }

        /*
         * Explicitly release references.
         */
        unique.length = 0;
        rows.length = 0;

      } catch (error) {

        console.warn(
          `RACE ERROR ${race.id}: ${error.message}`
        );
      }

      /*
       * Every race gets a chance to be
       * garbage collected.
       */
      if (
        typeof global.gc ===
        'function'
      ) {
        global.gc();
      }
    }

    /*
     * Let the JavaScript runtime clean up
     * between batches.
     */
    if (
      typeof global.gc ===
      'function'
    ) {
      global.gc();
    }

    console.log(
      ''
    );

    console.log(
      `BATCH ${batchNumber} COMPLETE`
    );

    console.log(
      `Progress: ${batchEnd}/${races.length} races`
    );

    console.log(
      `Nordic races found so far: ${stats.nordic}`
    );

    console.log(
      `Races with results so far: ${racesWithResults}`
    );

    console.log(
      `Unique result rows so far: ${totalRows}`
    );
  }

  /*
   * ==========================================================
   * STEP 5: VERIFY RESULTS
   * ==========================================================
   */

  await verifyPrevious(
    a.out,
    totalRows
  );

  /*
   * ==========================================================
   * STEP 6: BUILD FINAL results.json
   * ==========================================================
   */

  const metadata = {
    generatedAt:
      new Date().toISOString(),

    source:
      BASE,

    sport:
      a.sport,

    raceCount:
      racesWithResults,

    rowCount:
      totalRows,

    errorCount:
      0,

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
        stats.childPages,

      batchSize:
        a.batchSize,

      concurrency:
        a.concurrency,

      maxRaceKey:
        a.maxId
    }
  };

  console.log(
    ''
  );

  console.log(
    '=================================================='
  );

  console.log(
    'FINAL RESULTS'
  );

  console.log(
    '=================================================='
  );

  console.log(
    JSON.stringify(
      metadata.diagnostics,
      null,
      2
    )
  );

  console.log(
    `OUTPUT: ${metadata.raceCount} races, ${metadata.rowCount} rows`
  );

  /*
   * Convert temporary NDJSON into
   * the normal results.json structure.
   *
   * This is streamed and does not load
   * the entire result set into memory.
   */
  await buildFinalJson(
    ndjsonFile,
    a.out,
    metadata
  );

  /*
   * Remove temporary file.
   */
  try {
    await fs.unlink(
      ndjsonFile
    );
  } catch {
    // Ignore cleanup errors.
  }

  console.log(
    ''
  );

  console.log(
    `DONE: wrote ${a.out}`
  );
}

/* ============================================================
   START
   ============================================================ */

main().catch(error => {
  console.error(
    ''
  );

  console.error(
    'FATAL SCRAPER ERROR:'
  );

  console.error(
    error
  );

  process.exit(1);
});
