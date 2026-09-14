#!/usr/bin/env node

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const BASE = 'https://www.endurancepromotions.com';

const DEFAULTS = {
  sport: 'nordic',

  out: path.resolve(
    process.cwd(),
    'public',
    'results.json'
  ),

  /*
   * Keep this low.
   * We do NOT want lots of Endurance pages in memory simultaneously.
   */
  concurrency: 4,

  timeout: 20000,

  /*
   * IMPORTANT:
   *
   * Your first Nordic race was RaceKey 1723.
   *
   * We therefore do NOT scan RaceKeys 1-1722.
   */
  startId: 1723,

  /*
   * Change this if you eventually discover Nordic
   * races with RaceKeys higher than 3000.
   */
  maxId: 3000,

  /*
   * Process only 10 races before forcing cleanup.
   */
  batchSize: 10
};

/*
 * Nordic-specific terms.
 *
 * Deliberately DO NOT include plain "ski".
 *
 * A race such as:
 *
 * 2015 Bayport Belgian CX
 * Race Type: Cycling
 *
 * must not become Nordic simply because some unrelated
 * text contains "ski".
 */
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

function args(argv) {
  const o = {
    ...DEFAULTS
  };

  for (
    let i = 0;
    i < argv.length;
    i++
  ) {
    const arg = argv[i];

    if (arg === '--sport') {
      o.sport =
        argv[++i] ||
        o.sport;
    }

    else if (arg === '--out') {
      o.out = path.resolve(
        process.cwd(),
        argv[++i] ||
          o.out
      );
    }

    else if (arg === '--concurrency') {
      o.concurrency =
        Math.max(
          1,
          Number(argv[++i]) ||
            DEFAULTS.concurrency
        );
    }

    else if (arg === '--timeout') {
      o.timeout =
        Math.max(
          1000,
          Number(argv[++i]) ||
            DEFAULTS.timeout
        );
    }

    else if (arg === '--start-id') {
      o.startId =
        Math.max(
          1,
          Number(argv[++i]) ||
            DEFAULTS.startId
        );
    }

    else if (arg === '--max-id') {
      o.maxId =
        Math.max(
          o.startId,
          Number(argv[++i]) ||
            DEFAULTS.maxId
        );
    }

    else if (arg === '--batch-size') {
      o.batchSize =
        Math.max(
          1,
          Number(argv[++i]) ||
            DEFAULTS.batchSize
        );
    }

    else if (
      arg === '--help' ||
      arg === '-h'
    ) {
      console.log(`
Endurance Promotions Nordic scraper

Usage:

node scraper.cjs \\
  --sport nordic \\
  --start-id 1723 \\
  --max-id 3000 \\
  --batch-size 10 \\
  --concurrency 4 \\
  --out public/results.json

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

  return o;
}

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(value) {
  return clean(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase();
}

function abs(url, base = BASE) {
  try {
    return new URL(
      url,
      base
    ).href;
  } catch {
    return null;
  }
}

function decode(value) {
  return clean(
    String(value || '')
      .replace(
        /&nbsp;/gi,
        ' '
      )
      .replace(
        /&amp;/gi,
        '&'
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /&lt;/gi,
        '<'
      )
      .replace(
        /&gt;/gi,
        '>'
      )
      .replace(
        /&#(\d+);/g,
        (_, n) =>
          String.fromCharCode(
            Number(n)
          )
      )
  );
}

function strip(html) {
  return decode(
    String(html || '')
      .replace(
        /<br\s*\/?>/gi,
        ' '
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )
  );
}

function timeSec(value) {
  const v = clean(value);

  if (!v) {
    return null;
  }

  const parts =
    v.split(':')
      .map(Number);

  if (
    parts.length === 2 &&
    parts.every(
      Number.isFinite
    )
  ) {
    return (
      parts[0] * 60 +
      parts[1]
    );
  }

  if (
    parts.length === 3 &&
    parts.every(
      Number.isFinite
    )
  ) {
    return (
      parts[0] * 3600 +
      parts[1] * 60 +
      parts[2]
    );
  }

  return null;
}

function headerKey(value) {
  return norm(value)
    .replace(
      /[^a-z0-9]/g,
      ''
    );
}

/*
 * IMPORTANT FIX:
 *
 * This function is deliberately defensive.
 *
 * It will never assume r.firstName exists.
 */
function safeFirstName(row) {
  return clean(
    row?.firstName
  );
}

function safeLastName(row) {
  return clean(
    row?.lastName
  );
}

function looksNordic(r) {
  if (!r) {
    return false;
  }

  const raceType =
    norm(r.raceType);

  const text =
    norm(
      `${r.event || ''} ${
        r.location || ''
      } ${
        r.description || ''
      }`
    );

  /*
   * Endurance Promotions explicitly identifies
   * Nordic races as Race Type = Skiing.
   */
  if (
    raceType === 'skiing'
  ) {
    return true;
  }

  /*
   * Strong Nordic-specific phrases.
   */
  if (
    NORDIC_KEYWORDS.some(
      keyword =>
        text.includes(
          norm(keyword)
        )
    )
  ) {
    return true;
  }

  /*
   * "classic" and "pursuit" alone are too broad.
   *
   * Require ski/cross-country/nordic context.
   */
  if (
    text.includes('classic') &&
    (
      text.includes('ski') ||
      text.includes(
        'cross country'
      ) ||
      text.includes(
        'nordic'
      )
    )
  ) {
    return true;
  }

  if (
    text.includes('pursuit') &&
    (
      text.includes('ski') ||
      text.includes(
        'cross country'
      ) ||
      text.includes(
        'nordic'
      )
    )
  ) {
    return true;
  }

  return false;
}

function parseTables(html) {
  const tables = [];

  const source =
    String(html || '');

  for (
    const tableMatch of source.matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi
    )
  ) {
    const rows = [];

    for (
      const rowMatch of tableMatch[1].matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ) {
      const cells = [
        ...rowMatch[1].matchAll(
          /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
        )
      ].map(
        m => strip(m[1])
      );

      if (
        cells.length
      ) {
        rows.push(
          cells
        );
      }
    }

    if (
      rows.length
    ) {
      tables.push(
        rows
      );
    }
  }

  return tables;
}

function parseLinks(html) {
  const out = [];

  const source =
    String(html || '');

  for (
    const match of source.matchAll(
      /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )
  ) {
    const href =
      abs(match[1]);

    if (!href) {
      continue;
    }

    out.push({
      href,
      text: strip(
        match[2]
      )
    });
  }

  return out;
}

function findHeader(
  rows,
  required
) {
  if (
    !Array.isArray(rows)
  ) {
    return -1;
  }

  for (
    let i = 0;
    i <
      Math.min(
        rows.length,
        20
      );
    i++
  ) {
    const row =
      Array.isArray(
        rows[i]
      )
        ? rows[i]
        : [];

    const keys =
      row.map(
        headerKey
      );

    if (
      required.every(
        requiredName =>
          keys.includes(
            headerKey(
              requiredName
            )
          )
      )
    ) {
      return i;
    }
  }

  return -1;
}

/*
 * Parse the main Endurance Promotions results table.
 *
 * We specifically require:
 *
 * First Name
 * Last Name
 * Total Time
 */
function rowsFromTable(
  rows
) {
  if (
    !Array.isArray(rows)
  ) {
    return [];
  }

  const headerIndex =
    findHeader(
      rows,
      [
        'First Name',
        'Last Name',
        'Total Time'
      ]
    );

  if (
    headerIndex < 0
  ) {
    return [];
  }

  const header =
    Array.isArray(
      rows[headerIndex]
    )
      ? rows[headerIndex]
      : [];

  const indexes =
    {};

  header.forEach(
    (value, index) => {
      indexes[
        headerKey(value)
      ] = index;
    }
  );

  function get(
    row,
    ...names
  ) {
    if (
      !Array.isArray(row)
    ) {
      return '';
    }

    for (
      const name of names
    ) {
      const index =
        indexes[
          headerKey(name)
        ];

      if (
        index !== undefined
      ) {
        return clean(
          row[index]
        );
      }
    }

    return '';
  }

  const results = [];

  for (
    const row of rows.slice(
      headerIndex + 1
    )
  ) {
    if (
      !Array.isArray(row)
    ) {
      continue;
    }

    const firstName =
      get(
        row,
        'First Name'
      );

    const lastName =
      get(
        row,
        'Last Name'
      );

    const totalTime =
      get(
        row,
        'Total Time',
        'Time'
      );

    /*
     * Ignore header/filter rows and
     * non-result rows.
     */
    if (
      !firstName &&
      !lastName
    ) {
      continue;
    }

    /*
     * Some DNS rows have no time.
     * We keep them because they're still
     * legitimate race participants.
     */
    const place =
      get(
        row,
        'Pos',
        'Place'
      );

    const bib =
      get(
        row,
        'Bib #',
        'Bib'
      );

    const team =
      get(
        row,
        'Team'
      );

    const school =
      get(
        row,
        'School'
      );

    const className =
      get(
        row,
        'Class'
      );

    const field =
      get(
        row,
        'Field'
      );

    const city =
      get(
        row,
        'City'
      );

    const gender =
      get(
        row,
        'Gender'
      );

    const age =
      get(
        row,
        'Age'
      );

    const sourceAthleteId =
      get(
        row,
        'ResultsKey'
      );

    results.push({
      firstName,
      lastName,

      name: clean(
        `${firstName} ${lastName}`
      ),

      team,
      school,
      class: className,
      field,
      city,

      gender:
        gender || null,

      age:
        age || null,

      bib:
        bib || null,

      place:
        place &&
        /^\d+$/.test(
          place
        )
          ? Number(place)
          : null,

      time:
        totalTime ||
        null,

      timeSeconds:
        totalTime
          ? timeSec(
              totalTime
            )
          : null,

      sourceAthleteId:
        sourceAthleteId ||
        null
    });
  }

  return results;
}

function raceMeta(
  html,
  id
) {
  const text =
    strip(html);

  const titleMatch =
    text.match(
      /Individual Results for\s+([^\n]+)/i
    );

  const raceTypeMatch =
    text.match(
      /Race Type\s*\|\s*([^\n|]+)/i
    );

  const dateMatch =
    text.match(
      /Race Date\s*\|\s*([^\n|]+)/i
    );

  const locationMatch =
    text.match(
      /Race Location\s*\|\s*([^\n|]+)/i
    );

  const descriptionMatch =
    text.match(
      /Race Description\s*\|\s*([\s\S]*?)(?:Search by|Filter by|ResultsKey|$)/i
    );

  return {
    id: String(id),

    event: clean(
      titleMatch?.[1]
    ),

    raceType: clean(
      raceTypeMatch?.[1]
    ),

    date: clean(
      dateMatch?.[1]
    ),

    location: clean(
      locationMatch?.[1]
    ),

    description: clean(
      descriptionMatch?.[1]
    )
  };
}

async function fetchText(
  url,
  timeout,
  attempt = 0
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
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

    if (
      !response.ok
    ) {
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
  }

  catch (error) {
    if (
      attempt < 2
    ) {
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
        error?.message ||
        'Request failed'
    };
  }

  finally {
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
  const results =
    new Array(
      items.length
    );

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      try {
        results[index] =
          await fn(
            items[index],
            index
          );
      } catch {
        results[index] =
          null;
      }
    }
  }

  const workers =
    Math.min(
      limit,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workers
      },
      worker
    )
  );

  return results;
}

/*
 * DISCOVER RACES
 *
 * Starts at RaceKey 1723.
 *
 * We retain only tiny metadata objects.
 * We NEVER retain the HTML.
 */
async function discoverRaces(a) {
  console.log(
    `DISCOVERY: scanning RaceKeys ${a.startId}-${a.maxId}`
  );

  const ids = [];

  for (
    let id = a.startId;
    id <= a.maxId;
    id++
  ) {
    ids.push(id);
  }

  const races = [];

  /*
   * Process discovery in blocks.
   *
   * This prevents a giant array of
   * HTTP response objects.
   */
  const discoveryBlockSize =
    100;

  for (
    let start = 0;
    start < ids.length;
    start += discoveryBlockSize
  ) {
    const block =
      ids.slice(
        start,
        start +
          discoveryBlockSize
      );

    const found =
      await mapLimit(
        block,
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
            response.status !==
              200 ||
            !response.body
          ) {
            return null;
          }

          const meta =
            raceMeta(
              response.body,
              id
            );

          /*
           * Ignore pages that aren't
           * actual result pages.
           */
          if (
            !meta.event &&
            !meta.raceType
          ) {
            return null;
          }

          return {
            ...meta,
            url
          };
        }
      );

    for (
      const race of found
    ) {
      if (
        race
      ) {
        races.push(
          race
        );
      }
    }

    console.log(
      `DISCOVERY: checked ${Math.min(
        start +
          block.length,
        ids.length
      )}/${ids.length} IDs | found ${races.length} races`
    );

    /*
     * Explicitly release the block.
     */
    block.length = 0;

    if (
      typeof global.gc ===
      'function'
    ) {
      global.gc();
    }
  }

  /*
   * Sort by RaceKey.
   */
  races.sort(
    (a, b) =>
      Number(a.id) -
      Number(b.id)
  );

  return races;
}

/*
 * Create a compact duplicate key.
 *
 * This Set exists ONLY while processing ONE race.
 * It is NOT retained across the entire scraper run.
 */
function raceRowKey(
  row,
  raceId,
  sourceUrl
) {
  return [
    raceId,

    sourceUrl || '',

    row?.sourceAthleteId ||
      '',

    row?.bib || '',

    norm(
      row?.firstName
    ),

    norm(
      row?.lastName
    ),

    row?.time || '',

    row?.place || '',

    row?.field || ''
  ].join('|');
}

/*
 * Process ONE race.
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

  /*
   * IMPORTANT:
   *
   * This Set dies when processRace returns.
   *
   * We do NOT keep a global Set with
   * hundreds of thousands of result keys.
   */
  const seen =
    new Set();

  const results =
    [];

  function addRows(
    rows,
    sourceUrl
  ) {
    if (
      !Array.isArray(rows)
    ) {
      return;
    }

    for (
      const row of rows
    ) {
      if (
        !row
      ) {
        continue;
      }

      /*
       * Prevent the undefined.firstName
       * type of failure.
       */
      const firstName =
        safeFirstName(
          row
        );

      const lastName =
        safeLastName(
          row
        );

      /*
       * Don't save completely malformed
       * rows.
       */
      if (
        !firstName &&
        !lastName
      ) {
        continue;
      }

      const normalized =
        {
          ...row,

          firstName,

          lastName,

          name: clean(
            row.name ||
              `${firstName} ${lastName}`
          ),

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
        };

      const key =
        raceRowKey(
          normalized,
          race.id,
          sourceUrl
        );

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);

      results.push(
        normalized
      );
    }
  }

  /*
   * Fetch the main results page
   * and its pagination.
   */
  const seenPages =
    new Set();

  let linkedResults =
    [];

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

    seenPages.add(
      pageUrl.href
    );

    const tables =
      parseTables(
        response.body
      );

    let pageRows = 0;

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

        pageRows +=
          rows.length;
      }
    }

    /*
     * Find result files / child pages.
     */
    const links =
      parseLinks(
        response.body
      );

    for (
      const link of links
    ) {
      if (
        /ResultDetails\.aspx/i.test(
          link.href
        )
      ) {
        linkedResults.push(
          link
        );
      }
    }

    /*
     * Determine number of pages.
     */
    const pagination =
      strip(
        response.body
      ).match(
        /(\d+)\s+items?\s+in\s+(\d+)\s+pages?/i
      );

    if (
      pageNo === 1
    ) {
      if (
        !pagination
      ) {
        break;
      }

      const totalPages =
        Number(
          pagination[2]
        );

      if (
        !Number.isFinite(
          totalPages
        ) ||
        totalPages <= 1
      ) {
        break;
      }
    }

    /*
     * If a later page gives us nothing,
     * stop.
     */
    if (
      pageNo > 1 &&
      pageRows === 0
    ) {
      break;
    }
  }

  /*
   * Remove duplicate child links.
   */
  linkedResults =
    [
      ...new Map(
        linkedResults.map(
          link => [
            link.href,
            link
          ]
        )
      ).values()
    ];

  /*
   * Process child result pages.
   */
  for (
    const link of linkedResults
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
      !response.body
    ) {
      continue;
    }

    const childMeta =
      raceMeta(
        response.body,
        new URL(
          link.href
        ).searchParams.get(
          'id'
        ) ||
          race.id
      );

    /*
     * Only accept child pages that
     * are actually Nordic.
     */
    if (
      !looksNordic(
        childMeta
      )
    ) {
      continue;
    }

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

  if (
    results.length
  ) {
    stats.racesWithRows++;
  }

  return results;
}

/*
 * Append result rows directly to
 * the temporary NDJSON file.
 */
async function appendNdjson(
  file,
  rows
) {
  if (
    !Array.isArray(rows) ||
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
    let buffer =
      '';

    for (
      const row of rows
    ) {
      /*
       * Defensive check.
       */
      if (
        !row
      ) {
        continue;
      }

      buffer +=
        JSON.stringify(
          row
        ) +
        '\n';

      if (
        buffer.length >=
        1024 * 1024
      ) {
        await handle.write(
          buffer
        );

        buffer =
          '';
      }
    }

    if (
      buffer
    ) {
      await handle.write(
        buffer
      );
    }
  }

  finally {
    await handle.close();
  }
}

/*
 * Stream NDJSON into final results.json.
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

  const tempOutput =
    out + '.tmp';

  const output =
    fsSync.createWriteStream(
      tempOutput,
      {
        encoding: 'utf8'
      }
    );

  function write(
    text
  ) {
    return new Promise(
      (resolve, reject) => {
        if (
          output.write(
            text
          )
        ) {
          resolve();
        }
        else {
          output.once(
            'drain',
            resolve
          );
        }
      }
    );
  }

  await write(
    '{\n' +
    `  "generatedAt": ${JSON.stringify(metadata.generatedAt)},\n` +
    `  "source": ${JSON.stringify(metadata.source)},\n` +
    `  "sport": ${JSON.stringify(metadata.sport)},\n` +
    `  "raceCount": ${metadata.raceCount},\n` +
    `  "rowCount": ${metadata.rowCount},\n` +
    `  "errorCount": ${metadata.errorCount},\n` +
    `  "diagnostics": ${JSON.stringify(metadata.diagnostics, null, 2)},\n` +
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
    leftover +=
      chunk;

    const lines =
      leftover.split(
        '\n'
      );

    leftover =
      lines.pop() ||
      '';

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

      first =
        false;
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
        error => {
          if (
            error
          ) {
            reject(
              error
            );
          }
          else {
            resolve();
          }
        }
      );
    }
  );

  await fs.rename(
    tempOutput,
    out
  );
}

/*
 * Don't destroy a previous good results.json
 * if this run somehow returns zero rows.
 */
async function verifyPrevious(
  out,
  newRowCount
) {
  if (
    newRowCount > 0
  ) {
    return;
  }

  try {
    const previous =
      JSON.parse(
        await fs.readFile(
          out,
          'utf8'
        )
      );

    if (
      previous?.rowCount >
      0
    ) {
      throw new Error(
        `Refusing to overwrite ${out}: scraper returned 0 rows while previous file contains ${previous.rowCount}.`
      );
    }
  }

  catch (error) {
    /*
     * Re-throw our intentional protection error.
     */
    if (
      error?.message?.startsWith(
        'Refusing to overwrite'
      )
    ) {
      throw error;
    }

    /*
     * No previous file.
     */
  }
}

async function main() {
  const a =
    args(
      process.argv.slice(2)
    );

  console.log(
    '=========================================='
  );

  console.log(
    'Endurance Promotions Nordic Scraper'
  );

  console.log(
    '=========================================='
  );

  console.log(
    `RaceKey start: ${a.startId}`
  );

  console.log(
    `RaceKey end:   ${a.maxId}`
  );

  console.log(
    `Batch size:    ${a.batchSize}`
  );

  console.log(
    `Concurrency:   ${a.concurrency}`
  );

  console.log(
    ''
  );

  /*
   * STEP 1:
   *
   * Discover only RaceKeys starting at 1723.
   */
  const races =
    await discoverRaces(a);

  console.log(
    ''
  );

  console.log(
    `DISCOVERY COMPLETE: ${races.length} result pages found.`
  );

  /*
   * Only keep the metadata we need.
   */
  const nordicRaces =
    races.filter(
      looksNordic
    );

  console.log(
    `NORDIC RACES: ${nordicRaces.length}`
  );

  console.log(
    ''
  );

  /*
   * Temporary NDJSON.
   */
  const ndjsonFile =
    a.out +
    '.ndjson.tmp';

  await fs.mkdir(
    path.dirname(a.out),
    {
      recursive: true
    }
  );

  /*
   * Delete an old interrupted
   * temporary file.
   */
  try {
    await fs.unlink(
      ndjsonFile
    );
  }

  catch {
    // Nothing to remove.
  }

  const stats = {
    nordic: 0,
    racesWithRows: 0,
    txt: 0,
    pdf: 0,
    childPages: 0
  };

  let totalRows =
    0;

  let successfulRaces =
    0;

  /*
   * STEP 2:
   *
   * Process exactly 10 Nordic races
   * at a time.
   */
  for (
    let start = 0;
    start <
      nordicRaces.length;
    start +=
      a.batchSize
  ) {
    const end =
      Math.min(
        start +
          a.batchSize,
        nordicRaces.length
      );

    console.log(
      `BATCH ${Math.floor(start / a.batchSize) + 1}: races ${start + 1}-${end} of ${nordicRaces.length}`
    );

    for (
      let index = start;
      index < end;
      index++
    ) {
      const race =
        nordicRaces[index];

      /*
       * This should never be undefined,
       * but the check prevents the exact
       * type of crash you encountered.
       */
      if (
        !race
      ) {
        console.warn(
          `Skipping undefined race at index ${index}`
        );

        continue;
      }

      console.log(
        `  ${index + 1}/${nordicRaces.length} | ${race.id} | ${race.event}`
      );

      try {
        const rows =
          await processRace(
            race,
            a,
            stats
          );

        if (
          Array.isArray(
            rows
          ) &&
          rows.length
        ) {
          await appendNdjson(
            ndjsonFile,
            rows
          );

          totalRows +=
            rows.length;

          successfulRaces++;

          /*
           * IMPORTANT:
           *
           * Drop this race's rows immediately.
           */
          rows.length =
            0;
        }
      }

      catch (error) {
        console.warn(
          `  RACE ERROR ${race.id}: ${
            error?.message ||
            error
          }`
        );
      }
    }

    /*
     * Explicit cleanup between batches.
     */
    if (
      typeof global.gc ===
      'function'
    ) {
      global.gc();
    }

    console.log(
      `BATCH COMPLETE | ${successfulRaces} races with rows | ${totalRows} rows`
    );

    console.log(
      ''
    );
  }

  /*
   * Protect previous results.json.
   */
  await verifyPrevious(
    a.out,
    totalRows
  );

  const metadata = {
    generatedAt:
      new Date().toISOString(),

    source:
      BASE,

    sport:
      a.sport,

    raceCount:
      successfulRaces,

    rowCount:
      totalRows,

    errorCount:
      0,

    diagnostics: {
      raceKeysScanned:
        a.maxId -
        a.startId +
        1,

      racePagesDiscovered:
        races.length,

      nordicRaces:
        nordicRaces.length,

      nordicRacesWithRows:
        stats.racesWithRows,

      childResultPages:
        stats.childPages,

      batchSize:
        a.batchSize,

      concurrency:
        a.concurrency,

      startRaceKey:
        a.startId,

      maxRaceKey:
        a.maxId
    }
  };

  console.log(
    'FINAL RESULTS'
  );

  console.log(
    `Races: ${metadata.raceCount}`
  );

  console.log(
    `Rows:  ${metadata.rowCount}`
  );

  console.log(
    ''
  );

  /*
   * STEP 3:
   *
   * Stream NDJSON -> results.json.
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
  }

  catch {
    // Ignore cleanup failure.
  }

  console.log(
    `DONE: ${a.out}`
  );
}

main().catch(
  error => {
    console.error(
      'FATAL SCRAPER ERROR:',
      error?.message ||
        error
    );

    process.exit(1);
  }
);
