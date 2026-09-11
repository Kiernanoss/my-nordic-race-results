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

  // Keep network concurrency reasonable.
  concurrency: 8,

  timeout: 20000,

  // RaceKey discovery.
  blockSize: 250,
  emptyBlocks: 8,
  maxId: 3000,

  // IMPORTANT:
  // Results are processed in batches so thousands of race results
  // are never kept in memory at the same time.
  batchSize: 20
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
Usage:

node scraper.cjs --sport nordic --out public/results.json

Optional:

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

async function fetchText(
  url,
  timeout = 20000,
  attempt = 0
) {
  const c =
    new AbortController();

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

      if (i >= items.length) {
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

/*
 * DISCOVERY
 *
 * This is the important part that got us from 77 races
 * to the full set of discovered RaceKeys.
 *
 * We intentionally retain ONLY race metadata and URLs.
 * We do NOT retain the HTML.
 */
async function discoverByIds(a) {
  console.log(
    'DISCOVERY: Results grid does not expose race links to the scraper.'
  );

  console.log(
    'DISCOVERY: Switching to automatic RaceKey discovery.'
  );

  let start = 1;
  let end =
    DEFAULTS.blockSize;

  let empty = 0;

  const found =
    new Map();

  while (
    start <= a.maxId &&
    empty < DEFAULTS.emptyBlocks
  ) {
    const ids = [];

    for (
      let i = start;
      i <
      Math.min(
        end,
        a.maxId + 1
      );
      i++
    ) {
      ids.push(i);
    }

    const res =
      await mapLimit(
        ids,
        a.concurrency,
        async id => {
          const u =
            `${BASE}/ResultDetails.aspx?id=${id}`;

          const r =
            await fetchText(
              u,
              a.timeout
            );

          if (
            r.status !== 200 ||
            !r.body
          ) {
            return null;
          }

          const race =
            raceMeta(
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
            url: u
          };
        }
      );

    const hits =
      res.filter(Boolean);

    for (const r of hits) {
      found.set(
        r.id,
        r
      );
    }

    console.log(
      `DISCOVERY: probed RaceKey ${start}-${Math.min(
        end - 1,
        a.maxId
      )} -> ${hits.length} valid race pages (total ${found.size})`
    );

    if (hits.length === 0) {
      empty++;
    } else {
      empty = 0;
    }

    start = end;
    end +=
      DEFAULTS.blockSize;
  }

  return [
    ...found.values()
  ];
}

/*
 * Process ONE race.
 *
 * Nothing from previous races is retained here.
 */
async function processRace(
  race,
  a,
  stats
) {
  if (!looksNordic(race)) {
    return [];
  }

  stats.nordic++;

  const all = [];

  const addRows = (
    rows,
    src
  ) => {
    for (const row of rows) {
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
          src || race.url
      });
    }
  };

  const seenPages =
    new Set();

  let fileLinks = [];

  /*
   * Read the result grid.
   *
   * We preserve this logic because this is the part
   * that actually reads the Endurance Promotions results.
   */
  for (
    let pageNo = 1;
    pageNo <= 200;
    pageNo++
  ) {
    const u =
      new URL(race.url);

    if (pageNo > 1) {
      u.searchParams.set(
        'ctl00_cphMain_grdIndividualResultsChangePage',
        `${pageNo}_50`
      );
    }

    const r =
      await fetchText(
        u.href,
        a.timeout
      );

    if (!r.body) {
      break;
    }

    const tables =
      parseTables(r.body);

    let rowsFound = 0;

    for (const table of tables) {
      const got =
        rowsFromTable(table);

      if (got.length) {
        addRows(
          got,
          u.href
        );

        rowsFound +=
          got.length;
      }
    }

    const links =
      parseLinks(r.body);

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

    seenPages.add(
      u.href
    );

    /*
     * If the page has no rows, don't keep requesting
     * additional pages.
     */
    if (
      rowsFound === 0 &&
      pageNo > 1
    ) {
      break;
    }

    if (pageNo === 1) {
      const m =
        strip(r.body).match(
          /(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i
        );

      if (!m) {
        break;
      }

      if (
        Number(m[2]) <= 1
      ) {
        break;
      }
    }
  }

  /*
   * Remove duplicate links before fetching them.
   */
  fileLinks = [
    ...new Map(
      fileLinks.map(x => [
        x.href,
        x
      ])
    ).values()
  ];

  /*
   * Process linked result pages/files.
   */
  for (const l of fileLinks) {
    if (
      /ResultDetails\.aspx/i.test(
        l.href
      )
    ) {
      if (
        seenPages.has(
          l.href
        )
      ) {
        continue;
      }

      const rr =
        await fetchText(
          l.href,
          a.timeout
        );

      if (rr.body) {
        const child =
          raceMeta(
            rr.body,
            new URL(
              l.href
            ).searchParams.get(
              'id'
            ) || race.id
          );

        if (
          looksNordic(child)
        ) {
          const tables =
            parseTables(
              rr.body
            );

          for (
            const table of tables
          ) {
            addRows(
              rowsFromTable(
                table
              ),
              l.href
            );
          }

          stats.childPages++;
        }
      }

      continue;
    }

    const rr =
      await fetchText(
        l.href,
        a.timeout
      );

    if (!rr.body) {
      continue;
    }

    if (
      /\.txt/i.test(
        l.href
      )
    ) {
      const got =
        parseText(
          rr.body
        );

      if (got.length) {
        addRows(
          got,
          l.href
        );

        stats.txt++;
      }
    } else if (
      /\.pdf/i.test(
        l.href
      )
    ) {
      try {
        const response =
          await fetch(
            l.href,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0'
              }
            }
          );

        if (!response.ok) {
          continue;
        }

        const buf =
          Buffer.from(
            await response.arrayBuffer()
          );

        const parsed =
          await pdfParse(
            buf
          );

        const got =
          parseText(
            parsed.text
          );

        if (got.length) {
          addRows(
            got,
            l.href
          );

          stats.pdf++;
        }

        /*
         * Explicitly release references to large PDF data.
         */
        parsed.text = null;
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

/*
 * Global duplicate protection.
 *
 * IMPORTANT:
 * We store only the small string key, NOT the entire row.
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

/*
 * Remove duplicates inside a batch and against
 * all previously written batches.
 */
function dedupeBatch(
  rows,
  seen
) {
  const out = [];

  for (const r of rows) {
    const k =
      rowKey(r);

    if (seen.has(k)) {
      continue;
    }

    seen.add(k);
    out.push(r);
  }

  return out;
}

/*
 * Append JSON rows to NDJSON.
 *
 * NDJSON means:
 *
 * {"row":1}
 * {"row":2}
 * {"row":3}
 *
 * This lets us store potentially huge result sets
 * without keeping them all in Node's heap.
 */
async function appendNdjson(
  file,
  rows
) {
  if (!rows.length) {
    return;
  }

  const handle =
    await fs.open(
      file,
      'a'
    );

  try {
    let buffer = '';

    for (const row of rows) {
      buffer +=
        JSON.stringify(row) +
        '\n';

      /*
       * Keep the write buffer small.
       */
      if (
        buffer.length >
        1024 * 1024
      ) {
        await handle.write(
          buffer
        );

        buffer = '';
      }
    }

    if (buffer) {
      await handle.write(
        buffer
      );
    }
  } finally {
    await handle.close();
  }
}

/*
 * Build the final results.json by streaming the
 * temporary NDJSON file.
 *
 * The important part is that this does NOT do:
 *
 * JSON.parse(allResults)
 *
 * or:
 *
 * JSON.stringify(allResults)
 *
 * on the complete dataset.
 */
async function buildFinalJson(
  ndjsonFile,
  out,
  metadata
) {
  await fs.mkdir(
    path.dirname(out),
    {
      recursive: true
    }
  );

  const tmp =
    out + '.tmp';

  const output =
    fsSync.createWriteStream(
      tmp,
      {
        encoding: 'utf8'
      }
    );

  const write = chunk =>
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
    ',\n' +
    '  "matches": [\n'
  );

  let first = true;

  const input =
    fsSync.createReadStream(
      ndjsonFile,
      {
        encoding: 'utf8'
      }
    );

  let leftover = '';

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
      if (!line.trim()) {
        continue;
      }

      if (!first) {
        await write(',\n');
      }

      await write(
        '    ' +
        line
          .trim()
      );

      first = false;
    }
  }

  if (leftover.trim()) {
    if (!first) {
      await write(',\n');
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
        err =>
          err
            ? reject(err)
            : resolve()
      );
    }
  );

  await fs.rename(
    tmp,
    out
  );
}

/*
 * Protect the previous good results file.
 */
async function verifyPrevious(
  out,
  newRowCount
) {
  let prev = null;

  try {
    prev =
      JSON.parse(
        await fs.readFile(
          out,
          'utf8'
        )
      );
  } catch {
    return;
  }

  if (
    newRowCount === 0 &&
    prev?.rowCount > 0
  ) {
    throw new Error(
      `Refusing to overwrite ${out}: scraper returned 0 rows while previous file contains ${prev.rowCount}.`
    );
  }
}

async function main() {
  const a =
    args(
      process.argv.slice(2)
    );

  console.log(
    'Endurance Promotions automatic Nordic scraper v6'
  );

  console.log(
    'Memory-safe batched scraper'
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

  /*
   * STEP 1
   *
   * Discover RaceKeys.
   *
   * This is the working discovery system that found
   * the 757 races in your previous test.
   */
  const races =
    await discoverByIds(a);

  console.log(
    `DISCOVERY: ${races.length} race pages discovered automatically.`
  );

  /*
   * Temporary NDJSON file.
   *
   * This is where results are stored while the scraper
   * works through the batches.
   */
  const tempDir =
    path.dirname(a.out);

  await fs.mkdir(
    tempDir,
    {
      recursive: true
    }
  );

  const ndjsonFile =
    a.out + '.ndjson.tmp';

  /*
   * Start clean every run.
   */
  try {
    await fs.unlink(
      ndjsonFile
    );
  } catch {
    // Doesn't exist.
  }

  const stats = {
    nordic: 0,
    racesWithRows: 0,
    txt: 0,
    pdf: 0,
    childPages: 0
  };

  /*
   * Only duplicate keys stay in memory.
   *
   * The actual result rows do NOT.
   */
  const seen =
    new Set();

  let totalRows = 0;

  let raceCount = 0;

  /*
   * STEP 2
   *
   * Process races in batches.
   */
  for (
    let start = 0;
    start < races.length;
    start += a.batchSize
  ) {
    const batch =
      races.slice(
        start,
        start + a.batchSize
      );

    console.log(
      ''
    );

    console.log(
      `========== BATCH ${Math.floor(start / a.batchSize) + 1} ==========`
    );

    console.log(
      `Processing races ${start + 1}-${Math.min(
        start + batch.length,
        races.length
      )} of ${races.length}`
    );

    /*
     * Process this batch.
     *
     * We intentionally do NOT put all batches into
     * one giant "all" array.
     */
    for (
      let j = 0;
      j < batch.length;
      j++
    ) {
      const r =
        batch[j];

      const globalIndex =
        start + j;

      if (
        !looksNordic(r)
      ) {
        continue;
      }

      console.log(
        `RACE ${globalIndex + 1}/${races.length}: ${r.event} | ${r.date} | ${r.raceType} | ${r.url}`
      );

      try {
        const rows =
          await processRace(
            r,
            a,
            stats
          );

        const unique =
          dedupeBatch(
            rows,
            seen
          );

        if (
          unique.length
        ) {
          await appendNdjson(
            ndjsonFile,
            unique
          );

          totalRows +=
            unique.length;

          raceCount++;
        }

        /*
         * Drop the batch's row objects immediately.
         */
        rows.length = 0;
      } catch (e) {
        console.warn(
          `RACE ERROR ${r.id}: ${e.message}`
        );
      }
    }

    /*
     * Drop the batch reference.
     */
    batch.length = 0;

    /*
     * Give Node a chance to clean up between batches.
     */
    if (
      typeof global.gc ===
      'function'
    ) {
      global.gc();
    }

    console.log(
      `BATCH COMPLETE: processed through race ${Math.min(
        start + a.batchSize,
        races.length
      )}/${races.length}`
    );

    console.log(
      `RESULTS SO FAR: ${raceCount} races with results, ${totalRows} unique rows`
    );
  }

  /*
   * STEP 3
   *
   * Make sure we didn't accidentally produce an empty
   * result file when a previous good file exists.
   */
  await verifyPrevious(
    a.out,
    totalRows
  );

  /*
   * STEP 4
   *
   * Create final results.json by streaming the NDJSON.
   */
  const payload = {
    generatedAt:
      new Date().toISOString(),

    source:
      BASE,

    sport:
      a.sport,

    raceCount:
      raceCount,

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
        a.concurrency
    }
  };

  console.log(
    ''
  );

  console.log(
    'FINAL DIAGNOSTICS:',
    JSON.stringify(
      payload.diagnostics
    )
  );

  console.log(
    `OUTPUT: ${payload.raceCount} races, ${payload.rowCount} rows`
  );

  await buildFinalJson(
    ndjsonFile,
    a.out,
    payload
  );

  /*
   * Temporary file is no longer needed.
   */
  try {
    await fs.unlink(
      ndjsonFile
    );
  } catch {
    // Ignore cleanup failure.
  }

  console.log(
    `DONE: wrote ${a.out}`
  );
}

main().catch(e => {
  console.error(
    'FATAL SCRAPER ERROR:',
    e
  );

  process.exit(1);
});
