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

function findHeader(rows, required) {
  for (
    let i = 0;
    i < Math.min(rows.length, 15);
    i++
  ) {
    const ks =
      rows[i].map(headerKey);

    if (
      required.every(x =>
        ks.includes(
          headerKey(x)
        )
      )
    ) {
      return i;
    }
  }

  return -1;
}

function rowsFromTable(rows) {
  const hi = findHeader(
    rows,
    [
      'First Name',
      'Last Name',
      'Total Time'
    ]
  );

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
        get(r, 'Class'),

      field:
        get(r, 'Field'),

      city:
        get(r, 'City'),

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
        get(
          r,
          'ResultsKey'
        ) || null
    });
  }

  return out;
}

function parseText(text) {
  const out = [];

  for (
    const raw of String(
      text || ''
    ).split(/\r?\n/)
  ) {
    const s =
      clean(raw);

    if (
      !s ||
      /^place\s+bib/i.test(s) ||
      /^=+/.test(s)
    ) {
      continue;
    }

    const m =
      s.match(
        /^(\d+)\s+(\d+)\s+(.+?)\s+(\d{1,3}:\d{2}(?:\.\d+)?)$/
      );

    if (!m) {
      continue;
    }

    const n =
      splitName(m[3]);

    out.push({
      firstName:
        n.firstName,

      lastName:
        n.lastName,

      name:
        `${n.firstName} ${n.lastName}`,

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

      time:
        m[4],

      timeSeconds:
        timeSec(m[4]),

      sourceAthleteId:
        null
    });
  }

  return out;
}

/*
 * Extract race metadata from the page.
 *
 * We deliberately use whitespace-flexible regexes because
 * Endurance Promotions sometimes renders the metadata on
 * one line and sometimes with different HTML spacing.
 */
function raceMeta(html, id) {
  const raw =
    String(html || '');

  const text =
    strip(raw);

  const title =
    (
      text.match(
        /Individual Results for\s+(.+?)(?=\s+Race Details\s+Race Type|\s+Race Details|$)/i
      ) || []
    )[1] || '';

  const raceType =
    (
      text.match(
        /Race Type\s*\|\s*([^\|]+?)(?=\s+Race Date\s*\||$)/i
      ) || []
    )[1] || '';

  const date =
    (
      text.match(
        /Race Date\s*\|\s*([^\|]+?)(?=\s+Race Location\s*\||$)/i
      ) || []
    )[1] || '';

  const location =
    (
      text.match(
        /Race Location\s*\|\s*([^\|]+?)(?=\s+Race Description\s*\||$)/i
      ) || []
    )[1] || '';

  const desc =
    (
      text.match(
        /Race Description\s*\|\s*(.*?)(?=\s+Filter by Field:|\s+Search by Bib#|\s+ResultsKey\s*\||$)/i
      ) || []
    )[1] || '';

  return {
    id: String(id),

    event:
      clean(title),

    raceType:
      clean(raceType),

    date:
      clean(date),

    location:
      clean(location),

    description:
      clean(desc)
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

/*
 * Process one race.
 */
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

  const all = [];

  const addRows =
    (
      rows,
      sourceUrl
    ) => {
      for (
        const row of rows
      ) {
        all.push({
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
   * Read the main result grid.
   */
  for (
    let pageNo = 1;
    pageNo <= 200;
    pageNo++
  ) {
    const pageUrl =
      new URL(
        race.url
      );

    if (
      pageNo > 1
    ) {
      pageUrl.searchParams.set(
        'ctl00_cphMain_grdIndividualResultsChangePage',
        `${pageNo}_50`
      );
    }

    const response =
      await fetchText(
        pageUrl.href,
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

    let rowsFound =
      0;

    for (
      const table of tables
    ) {
      const rows =
        rowsFromTable(
          table
        );

      if (
        rows.length
      ) {
        addRows(
          rows,
          pageUrl.href
        );

        rowsFound +=
          rows.length;
      }
    }

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
      pageUrl.href
    );

    /*
     * Stop if the next result page is empty.
     */
    if (
      pageNo > 1 &&
      rowsFound === 0
    ) {
      break;
    }

    /*
     * Determine the number of result pages
     * from the first page.
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

      if (!pageInfo) {
        break;
      }

      const totalPages =
        Number(
          pageInfo[2]
        );

      if (
        totalPages <= 1
      ) {
        break;
      }
    }
  }

  /*
   * Process linked result pages and files.
   */
  for (
    const link of fileLinks.values()
  ) {
    /*
     * Some races link to other ResultDetails pages
     * for individual race components.
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
        const child =
          raceMeta(
            response.body,

            new URL(
              link.href
            ).searchParams.get(
              'id'
            ) || race.id
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
            addRows(
              rowsFromTable(
                table
              ),
              link.href
            );
          }

          stats.childPages++;
        }
      }

      continue;
    }

    /*
     * Text/PDF result files.
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
      const rows =
        parseText(
          response.body
        );

      if (
        rows.length
      ) {
        addRows(
          rows,
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
                  'Mozilla/5.0'
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

        const parsed =
          await pdfParse(
            buffer
          );

        const rows =
          parseText(
            parsed.text
          );

        if (
          rows.length
        ) {
          addRows(
            rows,
            link.href
          );

          stats.pdf++;
        }
      } catch {
        /*
         * Ignore an individual PDF failure.
         */
      }
    }
  }

  if (
    all.length
  ) {
    stats.racesWithRows++;
  }

  return all;
}

/*
 * Small duplicate key.
 *
 * We retain only this string in memory,
 * not duplicate result objects.
 */
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
      new Promise(
        (resolve, reject) => {
          if (
            stream.write(
              chunk
            )
          ) {
            resolve();
          } else {
            stream.once(
              'drain',
              resolve
            );
          }
        }
      );

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
    childPages: 0
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
            if (
              !firstRow
            ) {
              await writeChunk(output, ',\n');
            }

            await writeChunk(
              output,
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
        a.concurrency
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
