import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Snowflake, ChevronRight, ChevronLeft, Search, RefreshCw, ExternalLink,
  Trophy, Users, TrendingUp, Award, Calendar, Settings as SettingsIcon,
  LogOut, ArrowUpRight, ArrowDownRight, Minus, Check, X, Filter,
  Download, Eye, EyeOff, ChevronDown, MapPin, Flag, Menu, Mail,
} from "lucide-react";

/* ============================================================================
   FONTS + GLOBAL TOKENS
   Palette: snow white surfaces, deep spruce/navy ink, one icy-blue accent,
   a muted gold for podiums. Display face "Fraunces" (sharp, editorial,
   slightly cold) for numerals/headlines; "Inter" for body/UI text.
============================================================================ */
const NRR_FAVICON_DATA_URI = "data:image/png;base64,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";

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');

    :root {
      --snow: #FAFBFC;
      --card: #FFFFFF;
      --ink: #131C2E;
      --ink-soft: #4A5568;
      --slate: #7A8699;
      --border: #E4E9EE;
      --border-soft: #EEF1F5;
      --ice: #2E7DB5;
      --ice-soft: #EAF3FA;
      --ice-line: #CFE4F3;
      --gold: #A9821F;
      --gold-soft: #FBF4E2;
      --frost: #F3F6F9;
    }
    .nrr-root { font-family: 'Inter', sans-serif; color: var(--ink); background: var(--snow); }
    .nrr-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
    .nrr-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
    .nrr-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
    .nrr-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .nrr-focus:focus-visible { outline: 2px solid var(--ice); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) {
      .nrr-root * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
    .nrr-snowfall { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .nrr-flake { position: absolute; top: -10%; color: rgba(255,255,255,0.55); animation: nrr-fall linear infinite; }
    @keyframes nrr-fall { to { transform: translateY(120vh); } }
  `}</style>
);

/* ============================================================================
   RESULTS-DATA PROVIDER
   The UI talks to a real imported/API dataset through this async interface.
   No fabricated race results are used by the application dataset.
============================================================================ */
const RACES = []; // Real results are loaded from import/API data.


/* ---- swappable dataset: dataProvider.configure() lets the app plug in a
   real imported dataset (e.g. parsed Endurance Promotions scraper output)
   at runtime without any call site elsewhere in the app needing to change. */
let _races = RACES;
let _athletes = [];

const dataProvider = {
  configure(races, athletes) { _races = races; _athletes = athletes; },
  async getRaces() { return _races; },
  async getRace(id) { return _races.find((r) => r.id === id) || null; },
  async getAthleteResults(athleteId) {
    const rows = [];
    _races.forEach((r) => {
      const matches = (Array.isArray(r.results) ? r.results : []).filter((x) => x?.athleteId === athleteId);
      if (matches.length) rows.push({ race: r, result: matches[0] });
    });
    return rows.sort((a, b) => (a.race.date < b.race.date ? -1 : 1));
  },
  async findPossibleMatches(profile) {
    const norm = normalizeIdentity;
    const first = norm(profile.firstName);
    const last = norm(profile.lastName);
    const aliases = new Set((profile.aliases || []).map(norm).filter(Boolean));
    return _athletes
      .map((a) => {
        const full = norm(`${a.firstName} ${a.lastName}`);
        const nameExact = norm(a.firstName) === first && norm(a.lastName) === last;
        const aliasMatch = aliases.has(full) || aliases.has(norm(a.firstName)) || aliases.has(norm(a.lastName));
        if (!nameExact && !aliasMatch) return null;
        let score = nameExact ? 0.55 : 0.35;
        if (norm(a.team) && norm(a.team) === norm(profile.team)) score += 0.2;
        if (norm(a.school) && norm(a.school) === norm(profile.school)) score += 0.2;
        if (norm(a.city) && norm(a.city) === norm(profile.city)) score += 0.05;
        return { athlete: a, confidence: Math.min(score, 0.99) };
      })
      .filter(Boolean)
      .sort((a, b) => b.confidence - a.confidence);
  },
  async refresh() {
    const endpoint = getResultsApiUrl();
    if (!endpoint) {
      throw new Error("Refresh is not configured. Set VITE_RESULTS_API_URL (or window.__NRR_RESULTS_API_URL__) to your scraper/API endpoint.");
    }
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Results refresh failed (${response.status}).`);
    const payload = await response.text();
    const races = parseScraperExport(payload);
    return { updatedAt: new Date().toISOString(), newRaces: races.length, races };
  },
};

/* ============================================================================
   IMPORT PIPELINE — turns scraper output (results.json from the
   Endurance Promotions scraper) into this app's normalized Race/Result
   shape, and merges it with (or in place of) the sample dataset. This is
   the seam described in the build brief: swap the provider without
   touching any page component.
============================================================================ */
function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function stableHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function getResultsApiUrl() {
  if (typeof window !== "undefined" && window.__NRR_RESULTS_API_URL__) return window.__NRR_RESULTS_API_URL__;
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_RESULTS_API_URL) return import.meta.env.VITE_RESULTS_API_URL;
  return "./results.json";
}
function athleteIdentityKey(a) {
  // Endurance Promotions' ResultsKey is a RESULT/ROW id, not a persistent
  // athlete id. It changes from race to race, so using it here would make
  // every race look like a different athlete.
  const name = normalizeIdentity(`${a.firstName || ""} ${a.lastName || ""}`);
  const school = normalizeIdentity(a.school);
  const team = normalizeIdentity(a.team);
  const city = normalizeIdentity(a.city);

  if (school) return `person:${name}|school:${school}`;
  if (team) return `person:${name}|team:${team}`;
  if (city) return `person:${name}|city:${city}`;
  return `person:${name}`;
}

function fmtTime(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "Not available";
  const total = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function parseTimeToSeconds(str) {
  if (!str) return null;
  const s = String(str).trim();
  const parts = s.split(":").map((p) => parseFloat(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}
function normalizeDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // M/D/YYYY, common ASP.NET grid format
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const iso = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null; // unrecognized format — left null rather than guessed
}
function seasonFor(isoDate) {
  if (!isoDate) return "Unknown Season";
  const [y, m] = isoDate.split("-").map(Number);
  // Nordic season spans winter: Nov–Mar races in year Y belong to season "Y-1–Y" if before July, else "Y–Y+1"
  return m >= 7 ? `${y}–${String(y + 1).slice(2)}` : `${y - 1}–${String(y).slice(2)}`;
}
function guessDiscipline(eventName, raceLabel) {
  const s = `${eventName || ""} ${raceLabel || ""}`.toLowerCase();
  if (s.includes("skate") || s.includes("freestyle")) return "Skate";
  if (s.includes("classic")) return "Classic";
  if (s.includes("relay")) return "Relay";
  if (s.includes("pursuit")) return "Pursuit";
  return "Not available";
}
function splitFullName(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
function inferGenderFromRow(r) {
  const explicit = normalizeIdentity(r?.gender || "");
  if (explicit === "f" || /\b(girls?|female|women|womens)\b/.test(explicit)) return "F";
  if (explicit === "m" || /\b(boys?|male|men|mens)\b/.test(explicit)) return "M";

  const field = normalizeIdentity(r?.field || "");
  const cls = normalizeIdentity(r?.class || "");
  if (/^(g|girls?|female|women|womens)(\b|[_ -])/.test(field) || /^(g|girls?|female|women|womens)(\b|[_ -])/.test(cls)) return "F";
  if (/^(b|boys?|male|men|mens)(\b|[_ -])/.test(field) || /^(b|boys?|male|men|mens)(\b|[_ -])/.test(cls)) return "M";
  return "";
}
function inferDistanceKmFromResult(r, raceName = "") {
  const value = normalizeIdentity(`${r?.field || ""} ${r?.class || ""} ${raceName}`);
  if (/\b(bvar|gvar|varsity|var)\b/.test(value)) return 5;
  if (/\b(bjv|gjv|jv)\b/.test(value)) return 2.5;
  return null;
}

function normalizeRow(r, source) {
  r = r || {};
  if (source === "txt") {
    const { firstName, lastName } = splitFullName(r.name);
    return {
      firstName, lastName, team: r.team || r.school || "", school: r.school || "",
      city: r.city || "", gender: r.gender || inferGenderFromRow(r), field: r.field || "",
      sourceAthleteId: r.sourceAthleteId || r.athleteId || r.athleteID || r.athlete_id || r.personId || r.personID || "",
      class: r.grade || r.class || "", bib: r.bib || "", place: r.place || "",
      time: r.time || "", timeSec: parseTimeToSeconds(r.time),
      distanceKm: inferDistanceKmFromResult(r, ""),
    };
  }
  return {
    firstName: r.firstName || r.firstname || r.first_name || "", lastName: r.lastName || r.lastname || r.last_name || "",
    team: r.team || r.school || "", school: r.school || "", city: r.city || "",
    gender: r.gender || inferGenderFromRow(r), field: r.field || "",
    sourceAthleteId: r.sourceAthleteId || r.athleteId || r.athleteID || r.athlete_id || r.personId || r.personID || "",
    class: r.class || r.grade || "", bib: r.bib || r.bibNumber || "", place: r.place || r.position || "",
    time: r.time || r.totalTime || r.resultTime || "", timeSec: parseTimeToSeconds(r.time || r.totalTime || r.resultTime),
    distanceKm: inferDistanceKmFromResult(r, r.event || r.raceName || ""),
  };
}

/** Parses the raw JSON produced by the Endurance Promotions scraper
 *  (either the top-level `matches` array or a bare array of the same shape)
 *  into this app's Race[] structure. Throws with a readable message on
 *  malformed input rather than failing silently. */
function parseScraperExport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That doesn't look like valid JSON — paste the full contents of results.json."); }
  const matches = Array.isArray(data) ? data : (data.matches || data.results || data.data?.matches || data.data?.results);
  if (!Array.isArray(matches)) throw new Error("Expected a `matches` array (the output of scraper.js) but didn't find one.");
  if (matches.length === 0) throw new Error("No matches found in that file — nothing to import.");

  const byRace = new Map();
  matches.forEach((m) => {
    const raceKey = [m.sourceRaceId || m.sourceUrl || "", m.event || "", m.raceDate || "", m.raceLabel || m.race || "", m.raceLocation || ""].map(normalizeIdentity).join("|");
    if (!byRace.has(raceKey)) {
      const date = normalizeDate(m.raceDate || m.date);
      byRace.set(raceKey, {
        id: `imp_${byRace.size + 1}`,
        raceName: m.event || "Imported Race",
        date, season: seasonFor(date),
        location: m.raceLocation || m.location || "Not available",
        discipline: guessDiscipline(m.event, m.raceLabel),
        distanceKm: null,
        sourceUrl: m.sourceRaceUrl || m.sourceUrl || "https://www.endurancepromotions.com/Results.aspx",
        source: "endurance-promotions-import",
        rawRows: [], seen: new Set(),
      });
    }
    const race = byRace.get(raceKey);
    // Scraper output uses each match itself as the row. Older exports may
    // instead contain fullField or row, so accept all three shapes.
    const rows = m.fullField && m.fullField.length
      ? m.fullField
      : (m.row ? [m.row] : [m]);
    rows.forEach((r) => {
      const norm = normalizeRow(r, m.source);
      // The scraper can include the same athlete twice in a race: once as a
      // complete result row and once as a second, incomplete row from the
      // field/result view. Do not let the incomplete copy create a second
      // placement. Match on the athlete + field + bib + time, deliberately
      // ignoring place/team/school because those are exactly the fields that
      // may be missing from the duplicate.
      const dedupeKey = [
        normalizeIdentity(`${norm.firstName || ""} ${norm.lastName || ""}`),
        normalizeIdentity(norm.field || norm.class || ""),
        normalizeIdentity(norm.bib || ""),
        normalizeIdentity(norm.time || ""),
      ].join("|");
      const existingIndex = race.rawRows.findIndex((x) => {
        const key = [
          normalizeIdentity(`${x.firstName || ""} ${x.lastName || ""}`),
          normalizeIdentity(x.field || x.class || ""),
          normalizeIdentity(x.bib || ""),
          normalizeIdentity(x.time || ""),
        ].join("|");
        return key === dedupeKey && dedupeKey.split("|")[0] !== "";
      });
      if (existingIndex >= 0) {
        const existing = race.rawRows[existingIndex];
        const completeness = (x) =>
          (x.place != null && x.place !== "" ? 8 : 0) +
          (x.team ? 4 : 0) +
          (x.school ? 3 : 0) +
          (x.sourceAthleteId ? 2 : 0) +
          (x.city ? 1 : 0) +
          (x.bib ? 1 : 0);
        if (completeness(norm) > completeness(existing)) race.rawRows[existingIndex] = norm;
        return;
      }
      race.rawRows.push(norm);
    });
  });

  const races = [...byRace.values()].map((race) => {
    // Prefer the source's own place/position; fall back to sorting by time
    // when place is missing so "Around Me" still has a real order to use.
    const rows = race.rawRows.slice();
    const allHavePlace = rows.every((r) => r.place && !Number.isNaN(parseInt(r.place, 10)));
    const ordered = allHavePlace
      ? rows.sort((a, b) => parseInt(a.place, 10) - parseInt(b.place, 10))
      : rows.slice().sort((a, b) => (a.timeSec ?? Infinity) - (b.timeSec ?? Infinity));
    // A race can contain multiple fields/distances (JV=2.5K, Varsity=5K).
    // A time gap is only meaningful inside the same class/distance.
    const winnerTimeByGroup = new Map();
    ordered.forEach((r) => {
      if (r.timeSec == null) return;
      const group = `${normalizeIdentity(r.class || r.field || "")}|${r.distanceKm ?? "unknown"}`;
      if (!winnerTimeByGroup.has(group)) winnerTimeByGroup.set(group, r.timeSec);
    });
    const knownDistances = rows.map((r) => r.distanceKm).filter((v) => Number.isFinite(v));
    const distanceCounts = knownDistances.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const distanceValues = Object.keys(distanceCounts).map(Number);
    const raceDistanceKm = distanceValues.length === 1 ? distanceValues[0] : null;
    const classCounters = {};
    const results = ordered.map((r, i) => {
      classCounters[r.class] = (classCounters[r.class] || 0) + 1;
      return {
        id: `${race.id}_r${i}`,
        raceId: race.id,
        firstName: r.firstName, lastName: r.lastName, team: r.team, school: r.school, city: r.city || "",
        gender: r.gender || "", field: r.field || "", sourceAthleteId: r.sourceAthleteId || "",
        class: r.class || "Not available", classPosition: classCounters[r.class],
        bib: r.bib || "Not available",
        overallPosition: allHavePlace ? parseInt(r.place, 10) : i + 1,
        totalTimeSec: r.timeSec, totalTime: r.timeSec != null ? fmtTime(r.timeSec) : (r.time || "Not available"),
        distanceKm: r.distanceKm ?? (raceDistanceKm ? Number(raceDistanceKm) : null),
        timeGapSec: (() => {
          if (r.timeSec == null) return null;
          const group = `${normalizeIdentity(r.class || r.field || "")}|${r.distanceKm ?? "unknown"}`;
          const winner = winnerTimeByGroup.get(group);
          return winner != null ? r.timeSec - winner : null;
        })(),
      };
    });
    return {
      id: race.id, raceName: race.raceName, date: race.date, season: race.season,
      location: race.location, discipline: race.discipline, distanceKm: raceDistanceKm ? Number(raceDistanceKm) : race.distanceKm,
      sourceUrl: race.sourceUrl, source: race.source, fieldSize: results.length, results,
    };
  }).filter((r) => r.date); // drop races we couldn't get a real date for

  return races;
}

/** Assigns stable athlete ids to imported rows. Prefer a source-provided
 *  athlete id; otherwise use normalized name + school so changing teams does
 *  not automatically create a new athlete. */
function firstNameDistance(a, b) {
  a = normalizeIdentity(a); b = normalizeIdentity(b);
  if (!a || !b) return 99;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function samePerson(a, b) {
  const lastA = normalizeIdentity(a.lastName), lastB = normalizeIdentity(b.lastName);
  if (!lastA || !lastB || lastA !== lastB) return false;
  if (firstNameDistance(a.firstName, b.firstName) > 1) return false;
  const teamA = normalizeIdentity(a.team), teamB = normalizeIdentity(b.team);
  const schoolA = normalizeIdentity(a.school), schoolB = normalizeIdentity(b.school);
  const cityA = normalizeIdentity(a.city), cityB = normalizeIdentity(b.city);
  // Exact same name can safely merge when one source omitted team/school.
  if (normalizeIdentity(a.firstName) === normalizeIdentity(b.firstName)) {
    if ((!teamA || !teamB || teamA === teamB) && (!schoolA || !schoolB || schoolA === schoolB)) return true;
  }
  // Small first-name typo: require matching team/school when both are present.
  const teamMatches = teamA && teamB && teamA === teamB;
  const schoolMatches = schoolA && schoolB && schoolA === schoolB;
  const cityMatches = cityA && cityB && cityA === cityB;
  return teamMatches || schoolMatches || (teamA && !teamB && schoolA && schoolB && schoolA === schoolB) || cityMatches;
}

function buildCombinedDataset(importedRaces) {
  const races = Array.isArray(importedRaces) ? importedRaces.map((race) => ({
    ...race,
    results: (race.results || []).map((r) => ({ ...r, athleteId: r.athleteId || `imp_ath_${stableHash(athleteIdentityKey(r))}` })),
  })) : [];

  // Build one canonical athlete record across all races. This handles both
  // incomplete duplicate rows and small first-name typos without hard-coding
  // any athlete names.
  const registry = [];
  const idToCanonical = new Map();
  const score = (r) => (r.team ? 8 : 0) + (r.school ? 6 : 0) + (r.city ? 2 : 0) + (r.bib && r.bib !== "Not available" ? 1 : 0) + (r.field ? 1 : 0);

  races.forEach((race) => race.results.forEach((r) => {
    let person = registry.find((a) => samePerson(a, r));
    if (!person) {
      person = {
        id: `imp_ath_${stableHash(normalizeIdentity(`${r.firstName || ""} ${r.lastName || ""}`))}`,
        firstName: r.firstName || "", lastName: r.lastName || "",
        team: r.team || "", school: r.school || "", city: r.city || "",
        gender: r.gender || "", field: r.field || "", sourceAthleteId: r.sourceAthleteId || "",
        _score: score(r), _nameCounts: new Map([[normalizeIdentity(r.firstName || ""), { count: 1, display: r.firstName || "" }]]),
      };
      registry.push(person);
    } else {
      const s = score(r);
      if (s > person._score) {
        person.firstName = r.firstName || person.firstName;
        person.lastName = r.lastName || person.lastName;
        person._score = s;
      }
      person.team = person.team || r.team || "";
      person.school = person.school || r.school || "";
      person.city = person.city || r.city || "";
      person.gender = person.gender || r.gender || "";
      person.field = person.field || r.field || "";
      person.sourceAthleteId = person.sourceAthleteId || r.sourceAthleteId || "";
      const n = normalizeIdentity(r.firstName || "");
      const entry = person._nameCounts.get(n) || { count: 0, display: r.firstName || "" };
      entry.count += 1;
      if (!entry.display) entry.display = r.firstName || "";
      person._nameCounts.set(n, entry);
    }
    idToCanonical.set(r.athleteId, person.id);
    r.athleteId = person.id;
  }));

  // Keep the most common spelling for fuzzy matches.
  registry.forEach((a) => {
    const counts = [...a._nameCounts.entries()].sort((x, y) => y[1].count - x[1].count);
    if (counts[0]?.[1]?.display) a.firstName = counts[0][1].display;
    delete a._score; delete a._nameCounts;
  });

  return { races, athletes: registry };
}

/* ============================================================================
   PERSISTENCE (browser localStorage) — session, profile, corrections
============================================================================ */
const STORE_KEY = "nrr-app-state-v1";
function canUseLocalStorage() {
  try { return typeof window !== "undefined" && !!window.localStorage; } catch { return false; }
}
async function loadState() {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function saveState(state) {
  if (!canUseLocalStorage()) return;
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

const emptyState = {
  accounts: { mahtnordic: { password: "MHSwintersports", createdAt: new Date().toISOString() } }, // normalized username -> { password, createdAt }
  sessionEmail: null,
  profile: null,          // { firstName, lastName, preferredName, school, team, city, aliases, athleteId }
  confirmedMatches: {},   // athleteId -> 'me' | 'not-me'
  teammateOverrides: {},  // athleteId -> 'current' | 'former' | 'not-teammate' | 'unknown'
  removedRaceIds: [],
  importedRaces: [],      // Race[] parsed from scraper.js output via Settings → Import
  lastRefresh: null,
};

/* ============================================================================
   SMALL UI PRIMITIVES
============================================================================ */
const Card = ({ children, className = "", style }) => (
  <div className={`bg-white border rounded-2xl ${className}`} style={{ borderColor: "var(--border)", ...style }}>
    {children}
  </div>
);

const StatCard = ({ label, value, sub, icon: Icon }) => (
  <Card className="p-5 flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--slate)" }}>{label}</span>
      {Icon && <Icon size={15} style={{ color: "var(--ice)" }} strokeWidth={2} />}
    </div>
    <div className="nrr-display nrr-num text-3xl leading-none" style={{ color: "var(--ink)" }}>{value}</div>
    {sub && <div className="text-xs" style={{ color: "var(--slate)" }}>{sub}</div>}
  </Card>
);

const Pill = ({ children, tone = "default" }) => {
  const tones = {
    default: { bg: "var(--frost)", fg: "var(--ink-soft)" },
    ice: { bg: "var(--ice-soft)", fg: "var(--ice)" },
    gold: { bg: "var(--gold-soft)", fg: "var(--gold)" },
  };
  const t = tones[tone];
  return (
    <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
};

const Button = ({ children, onClick, variant = "primary", size = "md", icon: Icon, className = "", disabled, type = "button" }) => {
  const base = "nrr-focus inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { md: "px-4 py-2 text-sm", sm: "px-3 py-1.5 text-xs" };
  const variants = {
    primary: { background: "var(--ink)", color: "white" },
    outline: { background: "white", color: "var(--ink)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--ink-soft)" },
    ice: { background: "var(--ice)", color: "white" },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${sizes[size]} ${className}`} style={variants[variant]}>
      {Icon && <Icon size={14} strokeWidth={2.2} />}
      {children}
    </button>
  );
};

const Field = ({ label, ...props }) => (
  <label className="flex flex-col gap-1 text-sm">
    <span style={{ color: "var(--ink-soft)" }}>{label}</span>
    <input {...props} className="nrr-focus rounded-lg px-3 py-2 text-sm border" style={{ borderColor: "var(--border)" }} />
  </label>
);

function placeSuffix(n) {
  if (!n) return "";
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}
function primaryPlace(result) {
  // For an athlete's own results, the useful race placing is their placing
  // within their field/class (e.g. BVAR), while overallPosition remains the
  // whole-race position used by the full results table.
  return Number.isFinite(Number(result?.classPosition))
    ? Number(result.classPosition)
    : Number(result?.overallPosition);
}

function racePercentile(race, result) {
  const place = primaryPlace(result);
  if (!race || !Number.isFinite(place) || place < 1) return null;
  const field = race.results.filter((r) => normalizeIdentity(r.class) === normalizeIdentity(result.class));
  const size = field.length;
  if (size < 2) return 100;
  return Math.round(((size - place + 1) / size) * 100);
}

function rosterClassKey(value, raceName = "") {
  const raw = String(value || "").trim();
  const key = normalizeIdentity(raw).replace(/\s+/g, "").toUpperCase();
  const race = normalizeIdentity(raceName).replace(/\s+/g, "").toUpperCase();

  // Explicit JV/varsity labels always win.
  if (["GVAR", "VARG"].includes(key)) return "GVAR";
  if (["BVAR", "VARB"].includes(key)) return "BVAR";
  if (["GJV", "JVG"].includes(key)) return "GJV";
  if (["BJV", "JVB"].includes(key)) return "BJV";

  const isGirls = key.includes("GIRL") || key.includes("GJV") || key.includes("GVAR") ||
    key.includes("JVG") || key.includes("VARG") || race.includes("GIRL");
  const isBoys = key.includes("BOY") || key.includes("BJV") || key.includes("BVAR") ||
    key.includes("JVB") || key.includes("VARB") || race.includes("BOY");
  const isJV = key.includes("JV") || key.includes("JUNIOR") || race.includes("JV") || race.includes("JUNIOR");
  const isVarsity = key.includes("VAR") || key.includes("VARSITY") || race.includes("VAR") || race.includes("VARSITY");

  if (isGirls && isJV) return "GJV";
  if (isBoys && isJV) return "BJV";

  // Endurance Promotions uses labels such as "Boys Classic Results",
  // "Girls Classic Results", and relay-result titles. When there is no JV
  // marker, treat those school championship/varsity-style fields as varsity.
  if (isGirls && (isVarsity || key.includes("CLASSIC") || key.includes("SKATE") || key.includes("RELAY"))) return "GVAR";
  if (isBoys && (isVarsity || key.includes("CLASSIC") || key.includes("SKATE") || key.includes("RELAY"))) return "BVAR";

  // A race name can provide the gender when the class label is generic.
  if (isGirls) return "GVAR";
  if (isBoys) return "BVAR";
  return null;
}

const ROSTER_CLASS_ORDER = ["GVAR", "BVAR", "GJV", "BJV"];

function gapLabel(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 0.05) return "Winner";
  return `+${sec.toFixed(1)}s`;
}
function distanceLabel(distanceKm) {
  if (distanceKm === 5) return "5K";
  if (distanceKm === 2.5) return "2.5K";
  return "Distance not listed";
}
function pacePerKm(totalTimeSec, distanceKm) {
  if (!Number.isFinite(totalTimeSec) || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
  return totalTimeSec / distanceKm;
}
const BackToDashboard = ({ goto }) => (
  <button onClick={() => goto("dashboard")} className="nrr-focus text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}>
    <ChevronLeft size={14} /> Dashboard
  </button>
);

/* ============================================================================
   NAVIGATION
============================================================================ */
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: Snowflake },
  { key: "results", label: "My Results", icon: Flag },
  { key: "seasons", label: "My Seasons", icon: Calendar },
  { key: "team", label: "My Team", icon: Users },
  { key: "roster", label: "Team Roster", icon: Users },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "bests", label: "Personal Bests", icon: Award },
  { key: "settings", label: "Settings", icon: SettingsIcon },
  { key: "report", label: "Report Problem", icon: Mail },
];
const MOBILE_TABS = ["dashboard", "results", "team", "roster"];

/* ============================================================================
   AUTH SCREENS
============================================================================ */
function AuthScreen({ appState, setAppState }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const norm = (s) => (s || "").trim().toLowerCase();

  const handleSubmit = () => {
    setError(""); setNotice("");
    const accounts = appState.accounts;
    const key = norm(email);
    if (!key) return setError("Enter a username.");
    if (mode === "signup") {
      if (!password) return setError("Enter a password.");
      if (accounts[key]) return setError("An account with that username already exists.");
      setAppState({ ...appState, accounts: { ...accounts, [key]: { password, createdAt: new Date().toISOString() } }, sessionEmail: key });
    } else if (mode === "login") {
      const acc = accounts[key];
      if (!acc || acc.password !== password) return setError("Incorrect username or password.");
      setAppState({ ...appState, sessionEmail: key });
    } else if (mode === "reset") {
      if (!accounts[key]) return setError("No account found with that username.");
      setNotice("Password reset instructions have been sent (demo mode — no email is actually sent).");
    }
  };

  const submit = (e) => { if (e) e.preventDefault(); handleSubmit(); };
  const onKeyDown = (e) => { if (e.key === "Enter") submit(e); };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(180deg,#0F1B2D 0%, #16233B 55%, #1B2C46 100%)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center text-white">
          <Snowflake size={20} strokeWidth={1.6} />
          <span className="nrr-display text-lg tracking-tight">My Nordic Race Results</span>
        </div>
        <Card className="p-7">
          <h1 className="nrr-display text-2xl mb-1">
            {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--slate)" }}>
            {mode === "login" ? "Log in to see your race history." : mode === "signup" ? "This account is for My Nordic Race Results only." : "We'll send reset instructions to your email."}
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Username" type="text" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="Mahtnordic" required />
            {mode !== "reset" && (
              <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="••••••••" required />
            )}
            {error && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FBEAEA", color: "#9B2C2C" }}>{error}</div>}
            {notice && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--ice-soft)", color: "var(--ice)" }}>{notice}</div>}
            <Button type="submit" variant="ice" className="w-full py-2.5" onClick={submit}>
              {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>
          <div className="mt-5 flex flex-col gap-1.5 text-center text-xs" style={{ color: "var(--slate)" }}>
            {mode === "login" && (
              <>
                <button className="nrr-focus" onClick={() => { setMode("reset"); setError(""); }}>Forgot your password?</button>
                <button className="nrr-focus" onClick={() => { setMode("signup"); setError(""); }}>New here? Create an account</button>
              </>
            )}
            {mode !== "login" && <button className="nrr-focus" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Back to log in</button>}
          </div>
        </Card>
        <p className="text-center text-xs mt-5" style={{ color: "rgba(255,255,255,0.5)" }}>Results sourced from Endurance Promotions · sample data in this preview</p>
      </div>
    </div>
  );
}

function ProfileSetup({ onSave }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", preferredName: "", school: "", team: "", city: "", aliases: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => { if (e) e.preventDefault(); onSave(form); };
  const onKeyDown = (e) => { if (e.key === "Enter") submit(e); };
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--frost)" }}>
      <Card className="w-full max-w-lg p-8">
        <h1 className="nrr-display text-2xl mb-1">Set up your athlete profile</h1>
        <p className="text-sm mb-6" style={{ color: "var(--slate)" }}>
          This is how we'll locate your results — we never assume every result with your name belongs to you.
        </p>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <Field label="First name" value={form.firstName} onChange={set("firstName")} onKeyDown={onKeyDown} required />
          <Field label="Last name" value={form.lastName} onChange={set("lastName")} onKeyDown={onKeyDown} required />
          <Field label="Preferred name" value={form.preferredName} onChange={set("preferredName")} onKeyDown={onKeyDown} placeholder="Optional" />
          <Field label="City" value={form.city} onChange={set("city")} onKeyDown={onKeyDown} placeholder="City, State" />
          <Field label="School" value={form.school} onChange={set("school")} onKeyDown={onKeyDown} />
          <Field label="Team" value={form.team} onChange={set("team")} onKeyDown={onKeyDown} />
          <div className="col-span-2">
            <Field label="Other name spellings (comma separated)" value={form.aliases} onChange={set("aliases")} onKeyDown={onKeyDown} placeholder="Optional" />
          </div>
          <Button type="submit" variant="ice" className="col-span-2 py-2.5 mt-2" onClick={submit}>Continue to my results</Button>
        </form>
      </Card>
    </div>
  );
}

/* ============================================================================
   MATCH REVIEW ("Is this you?")
============================================================================ */
function MatchReview({ matches, decisions, onDecide, myAthleteId }) {
  if (myAthleteId) return null;
  const pending = matches.filter((m) => !(m.athlete.id in decisions));
  if (pending.length === 0) return null;

  // Review one candidate at a time. A single profile can only have one
  // confirmed "me" athlete, so we never silently accumulate multiple people.
  const current = pending[0];
  return (
    <Card className="p-5 mb-6" style={{ borderColor: "var(--ice-line)", background: "var(--ice-soft)" }}>
      <div className="flex items-start gap-3">
        <Eye size={18} style={{ color: "var(--ice)" }} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium mb-1">Is this you?</h3>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            We found a possible match for this profile. {pending.length > 1 ? `${pending.length - 1} other candidate${pending.length - 1 === 1 ? " is" : "s are"} waiting behind this one.` : ""}
          </p>
          <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4 justify-between" style={{ borderColor: "var(--border)" }}>
            <div className="text-sm">
              <div className="font-medium">{current.athlete.firstName} {current.athlete.lastName}</div>
              <div style={{ color: "var(--slate)" }}>{current.athlete.team || "No team listed"} · {current.athlete.school || "No school listed"} · {current.athlete.city || "No city listed"}</div>
              <div className="mt-1"><Pill tone="ice">{Math.round(current.confidence * 100)}% match confidence</Pill></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" icon={X} onClick={() => onDecide(current.athlete.id, "not-me")}>Not me</Button>
              <Button size="sm" variant="ice" icon={Check} onClick={() => onDecide(current.athlete.id, "me")}>Yes, this is me</Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ============================================================================
   AROUND ME TABLE
============================================================================ */
function AroundMe({ race, myResult }) {
  // "2 places ahead/behind" means the same official field. Never compare
  // a JV 2.5K result with a Varsity 5K result.
  const sameField = race.results.filter((r) =>
    myResult.class
      ? r.class === myResult.class
      : (myResult.distanceKm == null || r.distanceKm === myResult.distanceKm)
  );
  const idx = sameField.findIndex((r) => r.id === myResult.id);
  const window_ = idx >= 0
    ? sameField.slice(Math.max(0, idx - 2), Math.min(sameField.length, idx + 3))
    : [myResult];
  return (
    <>
      <div className="hidden sm:block overflow-x-auto nrr-scrollbar">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--slate)" }}>
              <th className="py-2 font-normal w-16">Place</th>
              <th className="py-2 font-normal">Athlete</th>
              <th className="py-2 font-normal">Team</th>
              <th className="py-2 font-normal text-right">Time</th>
              <th className="py-2 font-normal text-right">Diff</th>
            </tr>
          </thead>
          <tbody>
            {window_.map((r) => {
              const isMe = r.id === myResult.id;
              const diff = r.totalTimeSec - myResult.totalTimeSec;
              return (
                <tr key={r.id} style={isMe ? { background: "var(--ice-soft)" } : {}} className="border-t" >
                  <td className="py-2.5 pl-2 rounded-l-lg nrr-num font-medium" style={{ borderColor: "var(--border-soft)" }}>{r.overallPosition}</td>
                  <td className="py-2.5">{isMe ? <span className="font-semibold">{r.firstName} {r.lastName} · Me</span> : `${r.firstName} ${r.lastName}`}</td>
                  <td className="py-2.5" style={{ color: "var(--slate)" }}>{r.team}</td>
                  <td className="py-2.5 text-right nrr-num">{r.totalTime}</td>
                  <td className="py-2.5 pr-2 text-right nrr-num rounded-r-lg">{isMe ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}s`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden flex flex-col gap-2">
        {window_.map((r) => {
          const isMe = r.id === myResult.id;
          const diff = r.totalTimeSec - myResult.totalTimeSec;
          return (
            <div key={r.id} className="rounded-xl p-3 flex items-center justify-between border" style={{ borderColor: isMe ? "var(--ice-line)" : "var(--border-soft)", background: isMe ? "var(--ice-soft)" : "white" }}>
              <div className="flex items-center gap-3">
                <span className="nrr-num nrr-display text-lg w-9">{r.overallPosition}</span>
                <div>
                  <div className="text-sm font-medium">{r.firstName} {r.lastName}{isMe ? " · Me" : ""}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{r.team}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="nrr-num text-sm">{r.totalTime}</div>
                <div className="text-xs" style={{ color: "var(--slate)" }}>{isMe ? "Me" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}s`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ============================================================================
   RESULTS TABLE (full race results w/ search + filters)
============================================================================ */
function FullResultsTable({ race, myAthleteId }) {
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState("All");
  const [classFilter, setClassFilter] = useState("All");
  const teams = useMemo(() => ["All", ...new Set(race.results.map((r) => r.team))], [race]);
  const classes = useMemo(() => ["All", ...new Set(race.results.map((r) => r.class))], [race]);

  const rows = race.results.filter((r) => {
    const matchesQ = !q || `${r.firstName} ${r.lastName} ${r.team}`.toLowerCase().includes(q.toLowerCase());
    const matchesTeam = teamFilter === "All" || r.team === teamFilter;
    const matchesClass = classFilter === "All" || r.class === classFilter;
    return matchesQ && matchesTeam && matchesClass;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 border rounded-full px-3 py-1.5 flex-1 min-w-[160px]" style={{ borderColor: "var(--border)" }}>
          <Search size={14} style={{ color: "var(--slate)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search results…" className="nrr-focus text-sm flex-1 outline-none" />
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="nrr-focus text-sm border rounded-full px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="nrr-focus text-sm border rounded-full px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto nrr-scrollbar max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left border-b" style={{ color: "var(--slate)", borderColor: "var(--border)" }}>
              <th className="py-2 font-normal">Place</th>
              <th className="py-2 font-normal">Name</th>
              <th className="py-2 font-normal">Team</th>
              <th className="py-2 font-normal">Class</th>
              <th className="py-2 font-normal">Bib</th>
              <th className="py-2 font-normal text-right">Time</th>
              <th className="py-2 font-normal text-right">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--border-soft)", background: r.athleteId === myAthleteId ? "var(--ice-soft)" : "transparent" }}>
                <td className="py-2 nrr-num">{r.overallPosition}</td>
                <td className="py-2">{r.firstName} {r.lastName}</td>
                <td className="py-2" style={{ color: "var(--slate)" }}>{r.team}</td>
                <td className="py-2"><Pill>{r.class}</Pill></td>
                <td className="py-2 nrr-num" style={{ color: "var(--slate)" }}>{r.bib}</td>
                <td className="py-2 text-right nrr-num">{r.totalTime}</td>
                <td className="py-2 text-right nrr-num" style={{ color: "var(--slate)" }}>{gapLabel(r.timeGapSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================================
   RACE DETAIL PAGE
============================================================================ */
function RacePage({ race, myResult, profile, goto, teamResults }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <button onClick={() => goto("results")} className="nrr-focus text-xs flex items-center gap-1 mb-3" style={{ color: "var(--slate)" }}>
          <ChevronLeft size={14} /> My Results
        </button>
        <h1 className="nrr-display text-3xl mb-1">{race.raceName}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: "var(--slate)" }}>
          <span className="flex items-center gap-1"><Calendar size={13} /> {new Date(race.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
          <span className="flex items-center gap-1"><MapPin size={13} /> {race.location}</span>
          <span>{race.discipline}{race.distanceKm ? ` · ${race.distanceKm}K` : ""}</span>
        </div>
      </div>

      {myResult ? (
        <Card className="p-6">
          <div className="text-xs mb-2" style={{ color: "var(--slate)" }}>My Result</div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="nrr-display nrr-num text-5xl leading-none">{placeSuffix(primaryPlace(myResult))}</div>
              <div className="text-sm mt-1" style={{ color: "var(--slate)" }}>{myResult.class || "Field"} place</div>
            </div>
            <div className="nrr-num text-2xl">{myResult.totalTime}</div><div className="text-xs" style={{ color: "var(--slate)" }}>{distanceLabel(myResult.distanceKm)}</div>
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--ink-soft)" }}>
              <div><span style={{ color: "var(--slate)" }}>Class place</span><br />{placeSuffix(myResult.classPosition)} ({myResult.class})</div>
              <div><span style={{ color: "var(--slate)" }}>Percentile</span><br />{racePercentile(race, myResult) != null ? `${racePercentile(race, myResult)}th percentile` : "Not available"}</div>
              <div><span style={{ color: "var(--slate)" }}>Behind winner</span><br />{gapLabel(myResult.timeGapSec)}</div>
              <div><span style={{ color: "var(--slate)" }}>Bib</span><br />{myResult.bib}</div>
              <div><span style={{ color: "var(--slate)" }}>Team</span><br />{myResult.team}</div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-sm" style={{ color: "var(--slate)" }}>No result linked to your profile for this race yet.</Card>
      )}

      {myResult && (
        <Card className="p-6">
          <h3 className="font-medium mb-1">Around Me</h3>
          <div className="text-xs mb-4" style={{ color: "var(--slate)" }}>
            Same field only · {distanceLabel(myResult.distanceKm)}
          </div>
          <AroundMe race={race} myResult={myResult} />
        </Card>
      )}

      {teamResults.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4">My Team — {profile.team}</h3>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {teamResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="nrr-num w-8" style={{ color: "var(--slate)" }}>{r.overallPosition}</span>
                  <span className={r.athleteId === myResult?.athleteId ? "font-semibold" : ""}>{r.firstName} {r.lastName}{r.athleteId === myResult?.athleteId ? " (me)" : ""}</span>
                </div>
                <span className="nrr-num" style={{ color: "var(--slate)" }}>{r.totalTime}</span>
              </div>
            ))}
          </div>
          <div className="text-xs mt-3" style={{ color: "var(--slate)" }}>Application-calculated order — sorted by official finishing position, not an official team score.</div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-medium mb-4">Full Results</h3>
        <FullResultsTable race={race} myAthleteId={myResult?.athleteId} />
      </Card>

      <a href={race.sourceUrl} target="_blank" rel="noreferrer" className="nrr-focus flex items-center gap-1.5 text-sm self-start" style={{ color: "var(--ice)" }}>
        <ExternalLink size={14} /> View Original Results on Endurance Promotions
      </a>
    </div>
  );
}

/* ============================================================================
   ATHLETE PROFILE PAGE
============================================================================ */
function AthletePage({ athleteId, goto, meAthleteId, onCompare, athletes }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { dataProvider.getAthleteResults(athleteId).then(setRows); }, [athleteId]);
  const athlete = athletes.find((a) => a.id === athleteId);
  if (!athlete || !rows) return <div className="text-sm" style={{ color: "var(--slate)" }}>Loading…</div>;
  if (rows.length === 0) return <div className="flex flex-col gap-4"><button onClick={() => goto(-1)} className="nrr-focus text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}><ChevronLeft size={14} /> Back</button><div className="text-sm" style={{ color: "var(--slate)" }}>No results found for this athlete.</div></div>;

  const bestFinish = Math.min(...rows.map((r) => primaryPlace(r.result)));
  const avgFinish = (rows.reduce((s, r) => s + primaryPlace(r.result), 0) / rows.length).toFixed(1);
  const best5k = rows.filter((r) => r.result.distanceKm === 5 && Number.isFinite(r.result.totalTimeSec)).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0] || null;
  const best2_5k = rows.filter((r) => r.result.distanceKm === 2.5 && Number.isFinite(r.result.totalTimeSec)).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0] || null;
  const podiums = rows.filter((r) => primaryPlace(r.result) <= 3).length;

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => goto(-1)} className="nrr-focus text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}><ChevronLeft size={14} /> Back</button>
      <div>
        <h1 className="nrr-display text-3xl mb-1">{athlete.firstName} {athlete.lastName}</h1>
        <div className="text-sm" style={{ color: "var(--slate)" }}>{athlete.team} · {athlete.school}</div>
      </div>
      {athlete.id !== meAthleteId && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => onCompare(athlete.id)}>Compare with me</Button>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Races" value={rows.length} />
        <StatCard label="Best Finish" value={placeSuffix(bestFinish)} />
        <StatCard label="Avg Finish" value={avgFinish} />
        <StatCard label="Best 5K" value={best5k?.result.totalTime || "Not available"} />
        <StatCard label="Best 2.5K" value={best2_5k?.result.totalTime || "Not available"} />
        <StatCard label="Podiums" value={podiums} />
      </div>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Race History</h3>
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {rows.map(({ race, result }) => (
            <div key={race.id} className="flex flex-wrap items-center justify-between py-3 text-sm gap-2">
              <div>
                <div className="font-medium">{race.raceName}</div>
                <div style={{ color: "var(--slate)" }}>{race.date} · {race.discipline} · {distanceLabel(result.distanceKm)} · {result.class}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="nrr-num">{placeSuffix(primaryPlace(result))}</span>
                <span className="nrr-num" style={{ color: "var(--slate)" }}>{result.totalTime}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ============================================================================
   ATHLETE IDENTITY SAFETY
   A prior "Yes, this is me" decision must never override a newly entered
   athlete profile. Confirmed candidates are accepted only when they still
   match the active profile.
============================================================================ */
function athleteMatchesProfile(athlete, profile) {
  if (!athlete || !profile) return false;
  const aliases = new Set((profile.aliases || []).map(normalizeIdentity).filter(Boolean));
  const first = normalizeIdentity(profile.firstName);
  const last = normalizeIdentity(profile.lastName);
  const full = normalizeIdentity(`${athlete.firstName || ""} ${athlete.lastName || ""}`);
  const athleteFirst = normalizeIdentity(athlete.firstName);
  const athleteLast = normalizeIdentity(athlete.lastName);

  const exactName = athleteFirst === first && athleteLast === last;
  const aliasName = aliases.has(full) || aliases.has(athleteFirst) || aliases.has(athleteLast);
  if (!exactName && !aliasName) return false;

  const sameSchool = !profile.school || !athlete.school || normalizeIdentity(profile.school) === normalizeIdentity(athlete.school);
  const sameTeam = !profile.team || !athlete.team || normalizeIdentity(profile.team) === normalizeIdentity(athlete.team);
  const sameCity = !profile.city || !athlete.city || normalizeIdentity(profile.city) === normalizeIdentity(athlete.city);
  return sameSchool && sameTeam && sameCity;
}

/* ============================================================================
   MAIN APP
============================================================================ */
export default function App() {
  useEffect(() => {
    let link = document.querySelector('link[data-nrr-favicon]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.dataset.nrrFavicon = 'true';
      document.head.appendChild(link);
    }
    link.href = NRR_FAVICON_DATA_URI;
  }, []);
  const [ready, setReady] = useState(false);
  const [appState, setAppState] = useState(emptyState);
  const [page, setPage] = useState("dashboard");
  const [selectedRaceId, setSelectedRaceId] = useState(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const [compareId, setCompareId] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState([]);
  const [seasonFilter, setSeasonFilter] = useState("All");

  useEffect(() => {
    loadState().then((s) => {
      if (s) setAppState({ ...emptyState, ...s, accounts: { ...emptyState.accounts, ...s.accounts } });
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) saveState(appState); }, [appState, ready]);

  const isLoggedIn = !!appState.sessionEmail;
  const hasProfile = !!appState.profile;

  const combined = useMemo(() => buildCombinedDataset(appState.importedRaces), [appState.importedRaces]);
  useEffect(() => { dataProvider.configure(combined.races, combined.athletes); }, [combined]);

  // First launch should use the freshly published scraper output automatically.
  // Users should not have to manually import results.json after every scrape.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    fetch("./results.json", { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load published results (${response.status}).`);
        return response.text();
      })
      .then((text) => parseScraperExport(text))
      .then((races) => {
        if (cancelled || !races.length) return;
        setAppState((state) => ({
          ...state,
          importedRaces: races,
          lastRefresh: new Date().toISOString(),
        }));
      })
      .catch(() => {
        // Settings → Import/Refresh remains available if the published file is unavailable.
      });
    return () => { cancelled = true; };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    setMatches([]);
    if (!hasProfile) return () => { cancelled = true; };
    dataProvider.findPossibleMatches(appState.profile).then((found) => {
      if (!cancelled) setMatches(found);
    });
    return () => { cancelled = true; };
  }, [hasProfile, appState.profile, combined]);

  const myAthleteId = useMemo(() => {
    if (!hasProfile) return null;

    // Never let a previous person's confirmation survive a profile change.
    const confirmed = Object.entries(appState.confirmedMatches).find(([id, decision]) => {
      if (decision !== "me") return false;
      const athlete = combined.athletes.find((a) => a.id === id);
      return athleteMatchesProfile(athlete, appState.profile);
    });
    if (confirmed?.[0]) return confirmed[0];

    // Prefer a deterministic exact profile match before showing "Is this you?".
    const exact = combined.athletes.find((a) => {
      const name = normalizeIdentity(`${a.firstName} ${a.lastName}`);
      const profileName = normalizeIdentity(`${appState.profile.firstName} ${appState.profile.lastName}`);
      if (name !== profileName) return false;
      const sameSchool = !appState.profile.school || !a.school || normalizeIdentity(a.school) === normalizeIdentity(appState.profile.school);
      const sameTeam = !appState.profile.team || !a.team || normalizeIdentity(a.team) === normalizeIdentity(appState.profile.team);
      const sameCity = !appState.profile.city || !a.city || normalizeIdentity(a.city) === normalizeIdentity(appState.profile.city);
      return sameSchool && sameTeam && sameCity;
    });
    return exact?.id || null;
  }, [hasProfile, appState.profile, appState.confirmedMatches, combined]);

  // There is exactly one active athlete. "Yes, this is me" decisions for any
  // other athlete are deliberately ignored by the rest of the application.
  const confirmedMeIds = useMemo(() => new Set(myAthleteId ? [myAthleteId] : []), [myAthleteId]);

  const [myResults, setMyResults] = useState([]);
  useEffect(() => {
    if (!myAthleteId) return;
    Promise.all([...confirmedMeIds].map((id) => dataProvider.getAthleteResults(id))).then((lists) => {
      const flat = lists.flat().filter((r) => !appState.removedRaceIds.includes(r.race.id));
      const seen = new Set();
      const dedup = flat.filter((r) => (seen.has(r.race.id) ? false : (seen.add(r.race.id), true)));
      setMyResults(dedup.sort((a, b) => (a.race.date < b.race.date ? 1 : -1)));
    });
  }, [myAthleteId, confirmedMeIds, appState.removedRaceIds, combined]);

  const seasons = useMemo(() => [...new Set(myResults.map((r) => r.race.season))].sort(), [myResults]);
  const filteredResults = useMemo(() => seasonFilter === "All" ? myResults : myResults.filter((r) => r.race.season === seasonFilter), [myResults, seasonFilter]);

  const stats = useMemo(() => {
    if (myResults.length === 0) return null;
    const positions = myResults.map((r) => primaryPlace(r.result)).filter(Number.isFinite);
    const timed = myResults.filter((r) => Number.isFinite(r.result.totalTimeSec));
    const best5k = timed.filter((r) => r.result.distanceKm === 5).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0] || null;
    const best2_5k = timed.filter((r) => r.result.distanceKm === 2.5).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0] || null;
    const podiums = { 1: 0, 2: 0, 3: 0 };
    myResults.forEach((r) => { if (primaryPlace(r.result) <= 3) podiums[primaryPlace(r.result)]++; });
    const years = myResults.map((r) => r.race.date.slice(0, 4));
    return {
      races: myResults.length,
      bestFinish: positions.length ? Math.min(...positions) : null,
      avgFinish: positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : "—",
      best5k: best5k?.result.totalTime || "Not available",
      best2_5k: best2_5k?.result.totalTime || "Not available",
      best5kPace: best5k ? fmtTime(Math.round(best5k.result.totalTimeSec / 5)) + "/km" : "Not available",
      best2_5kPace: best2_5k ? fmtTime(Math.round(best2_5k.result.totalTimeSec / 2.5)) + "/km" : "Not available",
      podiums,
      totalPodiums: podiums[1] + podiums[2] + podiums[3],
      seasons: seasons.length,
      firstYear: Math.min(...years), lastYear: Math.max(...years),
    };
  }, [myResults, seasons]);

  const teamMembers = useMemo(() => {
    if (!appState.profile) return [];
    const wanted = normalizeIdentity(appState.profile.team);
    if (!wanted) return [];
    return combined.athletes.filter((a) => normalizeIdentity(a.team) === wanted || normalizeIdentity(a.school) === wanted);
  }, [appState.profile, combined]);

  const goto = (p, extra) => {
    if (p === "race") { setSelectedRaceId(extra); setPage("race"); }
    else if (p === "athlete") { setSelectedAthleteId(extra); setPage("athlete"); }
    else if (p === -1) { setPage("results"); }
    else { setPage(p); }
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await dataProvider.refresh();
      setAppState((s) => ({
        ...s,
        importedRaces: r.races,
        lastRefresh: r.updatedAt,
        confirmedMatches: {},
      }));
    } catch (err) {
      window.alert(err.message || "Could not refresh results.");
    } finally {
      setRefreshing(false);
    }
  };

  const exportCSV = () => {
    const header = ["Athlete", "School", "Team", "Season", "Race", "Date", "Location", "Discipline", "Class", "Place", "Time", "Gap"];
    const lines = [header.join(",")];
    myResults.forEach(({ race, result }) => {
      lines.push([
        `${appState.profile.firstName} ${appState.profile.lastName}`, appState.profile.school, appState.profile.team,
        race.season, race.raceName, race.date, race.location, race.discipline, result.class,
        result.overallPosition, result.totalTime, gapLabel(result.timeGapSec),
      ].map((v) => `"${v}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "my-nordic-race-results.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--frost)" }}><Snowflake className="animate-pulse" style={{ color: "var(--ice)" }} /></div>;
  if (!isLoggedIn) return <div className="nrr-root"><GlobalStyle /><AuthScreen appState={appState} setAppState={setAppState} /></div>;
  if (!hasProfile) return (
    <div className="nrr-root"><GlobalStyle />
      <ProfileSetup onSave={(form) => setAppState((s) => ({
      ...s,
      profile: { ...form, aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean) },
      // A new name/profile must not inherit a previous person's "Yes, this is me" decision.
      confirmedMatches: {},
      teammateOverrides: {},
    }))} />
    </div>
  );

  const selectedRace = selectedRaceId ? combined.races.find((r) => r.id === selectedRaceId) : null;
  const raceMyResult = selectedRace ? selectedRace.results.find((r) => confirmedMeIds.has(r.athleteId)) : null;
  const raceTeamResults = selectedRace ? selectedRace.results.filter((r) => r.team === appState.profile.team).sort((a, b) => a.overallPosition - b.overallPosition) : [];

  return (
    <div className="nrr-root min-h-screen flex">
      <GlobalStyle />

      {/* Sidebar */}
      <aside className={`fixed sm:static z-30 inset-y-0 left-0 w-64 border-r bg-white flex flex-col transition-transform sm:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`} style={{ borderColor: "var(--border)" }}>
        <div className="p-5 flex items-center gap-2">
          <Snowflake size={19} style={{ color: "var(--ice)" }} strokeWidth={1.8} />
          <span className="nrr-display text-base leading-tight">My Nordic<br />Race Results</span>
        </div>
        <nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto nrr-scrollbar">
          {NAV.map((item) => {
            const active = page === item.key;
            return (
              <button key={item.key} onClick={() => goto(item.key)}
                className="nrr-focus relative flex items-center gap-2.5 pl-3.5 pr-3 py-2.5 rounded-lg text-sm text-left transition-colors"
                style={{
                  background: active ? "var(--ice-soft)" : "transparent",
                  color: active ? "var(--ice)" : "var(--ink-soft)",
                  fontWeight: active ? 600 : 500,
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--frost)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: "var(--ice)" }} />}
                <item.icon size={16} strokeWidth={active ? 2.3 : 2} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="font-medium">{appState.profile.firstName} {appState.profile.lastName}</div>
          <div className="text-xs mb-3" style={{ color: "var(--slate)" }}>{appState.profile.team}</div>
          <button onClick={() => setAppState((s) => ({ ...s, sessionEmail: null, profile: null, confirmedMatches: {}, teammateOverrides: {} }))} className="nrr-focus flex items-center gap-1.5 text-xs" style={{ color: "var(--slate)" }}>
            <LogOut size={13} /> Log out
          </button>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 bg-black/30 z-20 sm:hidden" onClick={() => setNavOpen(false)} />}

      {/* Main */}
      <main className="flex-1 min-w-0 pb-20 sm:pb-0">
        <div className="sm:hidden flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10" style={{ borderColor: "var(--border)" }}>
          <button onClick={() => setNavOpen(true)} className="nrr-focus p-1 -m-1"><Menu size={20} /></button>
          <span className="nrr-display text-sm">My Nordic Race Results</span>
          <div className="w-5" />
        </div>

        <div className="max-w-5xl mx-auto p-5 sm:p-8">
          {page === "dashboard" && (
            <Dashboard appState={appState} stats={stats} myResults={myResults} goto={goto} teamMembers={teamMembers} matches={matches} myAthleteId={myAthleteId}
              onDecide={(id, d) => setAppState((s) => ({
                ...s,
                // Only one athlete may be confirmed as "me" for the active profile.
                confirmedMatches: d === "me" ? { [id]: "me" } : { ...s.confirmedMatches, [id]: d },
              }))}
              onRefresh={doRefresh} refreshing={refreshing} />
          )}
          {page === "results" && (
            <ResultsList myResults={filteredResults} seasons={seasons} seasonFilter={seasonFilter} setSeasonFilter={setSeasonFilter} goto={goto} />
          )}
          {page === "seasons" && <SeasonsPage myResults={myResults} seasons={seasons} goto={goto} />}
          {page === "team" && <TeamPage profile={appState.profile} teamMembers={teamMembers} myAthleteId={myAthleteId} appState={appState} setAppState={setAppState} goto={goto} />}
          {page === "roster" && <RosterPage profile={appState.profile} teamMembers={teamMembers} myAthleteId={myAthleteId} appState={appState} setAppState={setAppState} goto={goto} />}
          {page === "performance" && <PerformancePage myResults={myResults} goto={goto} />}
          {page === "bests" && <BestsPage stats={stats} myResults={myResults} goto={goto} />}
          {page === "settings" && <SettingsPage appState={appState} setAppState={setAppState} onRefresh={doRefresh} refreshing={refreshing} exportCSV={exportCSV} goto={goto} combined={combined} />}
          {page === "report" && <ReportProblemPage profile={appState.profile} />}
          {page === "race" && selectedRace && (
            <RacePage race={selectedRace} myResult={raceMyResult} profile={appState.profile} goto={goto} teamResults={raceTeamResults} />
          )}
          {page === "athlete" && selectedAthleteId && (
            <AthletePage athleteId={selectedAthleteId} goto={goto} meAthleteId={myAthleteId} onCompare={(id) => { setCompareId(id); setPage("compare"); }} athletes={combined.athletes} />
          )}
          {page === "compare" && compareId && (
            <ComparePage meId={myAthleteId} otherId={compareId} goto={goto} athletes={combined.athletes} />
          )}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t flex items-stretch" style={{ borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {MOBILE_TABS.map((key) => {
          const item = NAV.find((n) => n.key === key);
          const active = page === key;
          return (
            <button key={key} onClick={() => goto(key)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
              style={{ color: active ? "var(--ice)" : "var(--slate)" }}>
              <item.icon size={19} strokeWidth={active ? 2.4 : 1.9} />
              <span className="text-[10px]" style={{ fontWeight: active ? 600 : 400 }}>{item.label.replace("My ", "")}</span>
            </button>
          );
        })}
        <button onClick={() => setNavOpen(true)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
          style={{ color: navOpen || NAV.filter((n) => !MOBILE_TABS.includes(n.key)).some((n) => n.key === page) ? "var(--ice)" : "var(--slate)" }}>
          <Menu size={19} strokeWidth={1.9} />
          <span className="text-[10px]">More</span>
        </button>
      </nav>
    </div>
  );
}

/* ============================================================================
   REPORT PROBLEM
============================================================================ */
function ReportProblemPage({ profile }) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const sendReport = () => {
    const body = [
      "Nordic Race Results - Problem Report",
      "",
      `Name: ${profile?.firstName || ""} ${profile?.lastName || ""}`.trim(),
      `Team: ${profile?.team || "Not provided"}`,
      `School: ${profile?.school || "Not provided"}`,
      "",
      "Problem:",
      message.trim(),
    ].join("\\n");

    window.location.href = `mailto:kiernanguerrino@gmail.com?subject=${encodeURIComponent("Nordic Race Results - Problem Report")}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Mail size={24} style={{ color: "var(--ice)" }} />
        <h1 className="nrr-display text-3xl">Report Problem</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--slate)" }}>
        Found something that isn't working correctly? Tell me what happened and I'll take a look.
      </p>

      <div className="bg-white border rounded-xl p-5" style={{ borderColor: "var(--border)" }}>
        <label className="block text-sm font-medium mb-2">What is the problem?</label>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value); setSent(false); }}
          placeholder="Describe what went wrong..."
          rows={8}
          className="w-full rounded-lg border p-3 text-sm resize-y outline-none"
          style={{ borderColor: "var(--border)" }}
        />
        <button
          onClick={sendReport}
          disabled={!message.trim()}
          className="mt-4 nrr-focus inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ice)", color: "white" }}
        >
          <Mail size={16} />
          Send Report
        </button>
        {sent && (
          <p className="text-xs mt-3" style={{ color: "var(--slate)" }}>
            Your email app should have opened with the report addressed to kiernanguerrino@gmail.com.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   DASHBOARD
============================================================================ */
function Dashboard({ appState, stats, myResults, goto, teamMembers, matches, myAthleteId, onDecide, onRefresh, refreshing }) {
  const latest = myResults[0];
  const chartData = [...myResults].reverse().map((r, i) => ({
    i: i + 1,
    date: r.race.date,
    place: primaryPlace(r.result),
    name: r.race.raceName,
  }));
  const p = appState.profile;
  const recent = myResults.slice(0, 5);
  const bestFinish = stats?.bestFinish != null ? placeSuffix(stats.bestFinish) : "—";
  const avgFinish = stats?.avgFinish ?? "—";
  const teamLabel = p.team || p.school || "Team";

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <MatchReview matches={matches} decisions={appState.confirmedMatches} onDecide={onDecide} myAthleteId={myAthleteId} />

      {!stats ? (
        <Card className="p-8 text-center">
          <p className="mb-1 font-medium">No race results found yet.</p>
          <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>Double-check the details on your athlete profile.</p>
          <Button variant="ice" onClick={() => goto("settings")}>Check Athlete Profile</Button>
        </Card>
      ) : (
        <>
          {/* Dashboard header / hero */}
          <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "var(--ice-line)", background: "linear-gradient(110deg,#F4FAFE 0%,#EAF4FB 55%,#DCEEF9 100%)" }}>
            <div className="absolute inset-0 pointer-events-none opacity-60" style={{ background: "linear-gradient(150deg, transparent 45%, rgba(255,255,255,.8) 45.5%, transparent 52%), linear-gradient(25deg, transparent 58%, rgba(255,255,255,.55) 58.5%, transparent 66%)" }} />
            <div className="absolute right-0 bottom-0 w-3/5 h-2/3 opacity-50 pointer-events-none" style={{ clipPath: "polygon(0 100%, 18% 45%, 30% 65%, 48% 18%, 62% 55%, 77% 5%, 100% 72%, 100% 100%)", background: "linear-gradient(145deg,#D2E8F5,#A8CEE7)" }} />
            <div className="relative p-5 sm:p-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--ice)" }}>Nordic Race Results</div>
                <h1 className="nrr-display text-3xl sm:text-4xl leading-tight">Welcome Back</h1>
                <p className="text-sm sm:text-base mt-1" style={{ color: "#31577B" }}>Track your races. See your progress. Go further.</p>
              </div>
              <div className="flex items-center gap-3 bg-white/80 rounded-xl px-3 py-2 border" style={{ borderColor: "rgba(207,228,243,.9)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--ice)", color: "white" }}><Users size={18} /></div>
                <div>
                  <div className="text-sm font-semibold">{p.firstName} {p.lastName}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{teamLabel} · {p.city || p.school || "Nordic"}</div>
                </div>
                <ChevronDown size={15} style={{ color: "var(--slate)" }} />
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#DDF0FC", color: "var(--ice)" }}><Trophy size={21} /></div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold">Best Finish</div>
                  <div className="nrr-display nrr-num text-2xl sm:text-3xl mt-1">{bestFinish}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{myResults[0]?.result.class || "Field"}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#DDF0FC", color: "var(--ice)" }}><TrendingUp size={21} /></div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold">Average Finish</div>
                  <div className="nrr-display nrr-num text-2xl sm:text-3xl mt-1">{avgFinish}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{myResults[0]?.result.class || "Field"}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#DDF0FC", color: "var(--ice)" }}><Calendar size={21} /></div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold">Races Completed</div>
                  <div className="nrr-display nrr-num text-2xl sm:text-3xl mt-1">{stats.races}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{stats.seasons} season{stats.seasons === 1 ? "" : "s"}</div>
                </div>
              </div>
            </Card>
            <Card className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "#DDF0FC", color: "var(--ice)" }}><Award size={21} /></div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold">Podium Finishes</div>
                  <div className="nrr-display nrr-num text-2xl sm:text-3xl mt-1">{stats.totalPodiums}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{stats.podiums[1]} first · {stats.podiums[2]} second · {stats.podiums[3]} third</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Main two-column section */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5">
            <Card className="p-4 sm:p-6 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg">Performance Trend</h3>
                  <div className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>Class placement · lower is better</div>
                </div>
                <span className="text-xs border rounded-lg px-2.5 py-1.5 bg-white" style={{ borderColor: "var(--border)", color: "var(--ink-soft)" }}>Class Placement <ChevronDown size={13} className="inline ml-1" /></span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 4 }}>
                  <CartesianGrid stroke="var(--border-soft)" vertical={true} />
                  <XAxis dataKey="i" tickFormatter={(v) => chartData[v - 1]?.date ? new Date(chartData[v - 1].date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""} tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} />
                  <YAxis reversed tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip formatter={(v) => [placeSuffix(v), "Place"]} labelFormatter={(v) => chartData[v - 1]?.name || ""} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
                  <Line type="monotone" dataKey="place" stroke="var(--ice)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--ice)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4 sm:p-6 min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-base sm:text-lg">Recent Races</h3>
                <button onClick={() => goto("results")} className="nrr-focus text-xs flex items-center gap-0.5" style={{ color: "var(--ice)" }}>View All <ChevronRight size={13} /></button>
              </div>
              <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 px-2 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--slate)", background: "var(--frost)" }}>
                <span>Date</span><span>Race</span><span>Result</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
                {recent.map(({ race, result }) => (
                  <button key={race.id} onClick={() => goto("race", race.id)} className="nrr-focus w-full grid grid-cols-[auto_1fr_auto] gap-x-3 items-center px-2 py-2.5 text-left text-xs sm:text-sm">
                    <span className="whitespace-nowrap" style={{ color: "var(--slate)" }}>{new Date(race.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <span className="font-medium truncate">{race.raceName}</span>
                    <span className="nrr-num whitespace-nowrap font-semibold">{placeSuffix(primaryPlace(result))} {result.class}</span>
                  </button>
                ))}
                {recent.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--slate)" }}>No races yet.</div>}
              </div>
            </Card>
          </div>

          {/* Bottom dashboard cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            <Card className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-base sm:text-lg">Team Roster</h3>
                <button onClick={() => goto("roster")} className="nrr-focus text-xs flex items-center" style={{ color: "var(--ice)" }}>View All <ChevronRight size={13} /></button>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
                {teamMembers.slice(0, 5).map((a) => (
                  <button key={a.id} onClick={() => goto("athlete", a.id)} className="nrr-focus w-full flex items-center justify-between py-2.5 text-sm text-left">
                    <span className="font-medium">{a.firstName} {a.lastName}</span>
                    <span className="text-xs" style={{ color: "var(--slate)" }}>{a.team || a.school || "Team"}</span>
                  </button>
                ))}
                {teamMembers.length === 0 && <div className="py-3 text-sm" style={{ color: "var(--slate)" }}>No teammates found.</div>}
              </div>
            </Card>

            <Card className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-base sm:text-lg">Season Summary</h3>
                <button onClick={() => goto("seasons")} className="nrr-focus text-xs flex items-center" style={{ color: "var(--ice)" }}>View All <ChevronRight size={13} /></button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2" style={{ borderColor: "var(--border-soft)" }}><span style={{ color: "var(--slate)" }}>Races</span><strong>{stats.races}</strong></div>
                <div className="flex justify-between border-b pb-2" style={{ borderColor: "var(--border-soft)" }}><span style={{ color: "var(--slate)" }}>Best finish</span><strong>{bestFinish}</strong></div>
                <div className="flex justify-between border-b pb-2" style={{ borderColor: "var(--border-soft)" }}><span style={{ color: "var(--slate)" }}>Average finish</span><strong>{avgFinish}</strong></div>
                <div className="flex justify-between"><span style={{ color: "var(--slate)" }}>Best 5K</span><strong className="nrr-num">{stats.best5k}</strong></div>
              </div>
            </Card>

            <Card className="p-4 sm:p-6">
              <h3 className="font-semibold text-base sm:text-lg mb-3">Quick Stats</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2" style={{ color: "var(--slate)" }}><Snowflake size={16} style={{ color: "var(--ice)" }} /> Total Races</span><strong>{stats.races}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2" style={{ color: "var(--slate)" }}><TrendingUp size={16} style={{ color: "var(--ice)" }} /> Podiums</span><strong>{stats.totalPodiums}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2" style={{ color: "var(--slate)" }}><Trophy size={16} style={{ color: "var(--ice)" }} /> Best 5K</span><strong className="nrr-num">{stats.best5k}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2" style={{ color: "var(--slate)" }}><Calendar size={16} style={{ color: "var(--ice)" }} /> Seasons</span><strong>{stats.seasons}</strong></div>
              </div>
            </Card>
          </div>

          {latest && (
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--slate)" }}>Latest Result</div>
                  <div className="font-semibold mt-1">{latest.race.raceName}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--slate)" }}>{latest.race.date} · {latest.result.class}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right"><div className="nrr-display nrr-num text-2xl">{placeSuffix(primaryPlace(latest.result))}</div><div className="text-xs" style={{ color: "var(--slate)" }}>field place</div></div>
                  <div className="text-right"><div className="nrr-num font-semibold">{latest.result.totalTime}</div><div className="text-xs" style={{ color: "var(--slate)" }}>time</div></div>
                  <Button variant="outline" size="sm" onClick={() => goto("race", latest.race.id)} icon={ChevronRight}>View</Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================================
   RESULTS LIST
============================================================================ */
function ResultsList({ myResults, seasons, seasonFilter, setSeasonFilter, goto }) {
  const [q, setQ] = useState("");
  const rows = myResults.filter((r) => !q || r.race.raceName.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">My Results</h1>
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 border rounded-full px-3 py-1.5 flex-1 min-w-[180px]" style={{ borderColor: "var(--border)" }}>
          <Search size={14} style={{ color: "var(--slate)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my races…" className="nrr-focus text-sm flex-1 outline-none" />
        </div>
        <select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)} className="nrr-focus text-sm border rounded-full px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
          <option>All</option>
          {seasons.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map(({ race, result }) => (
          <button key={race.id} onClick={() => goto("race", race.id)} className="nrr-focus text-left">
            <Card className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 hover:border-[var(--ice-line)]">
              <div>
                <div className="text-xs mb-1" style={{ color: "var(--slate)" }}>{new Date(race.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
                <div className="font-medium">{race.raceName}</div>
                <div className="text-sm" style={{ color: "var(--slate)" }}>{race.location} · {race.discipline} · {distanceLabel(result.distanceKm)}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="nrr-num nrr-display text-xl">{placeSuffix(primaryPlace(result))}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{result.class}</div>
                </div>
                <div className="text-right">
                  <div className="nrr-num">{result.totalTime}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{gapLabel(result.timeGapSec)}</div>
                </div>
                <ChevronRight size={16} style={{ color: "var(--slate)" }} />
              </div>
            </Card>
          </button>
        ))}
        {rows.length === 0 && <p className="text-sm" style={{ color: "var(--slate)" }}>No races match your search.</p>}
      </div>
    </div>
  );
}

/* ============================================================================
   SEASONS
============================================================================ */
function SeasonsPage({ myResults, seasons, goto }) {
  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">My Seasons</h1>
      {seasons.map((season) => {
        const rows = myResults.filter((r) => r.race.season === season);
        const positions = rows.map((r) => primaryPlace(r.result));
        const times = rows.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
        const podiums = rows.filter((r) => primaryPlace(r.result) <= 3).length;
        const bestTime = times.length ? rows.find((r) => r.result.totalTimeSec === Math.min(...times))?.result.totalTime : "Not available";
        return (
          <Card key={season} className="p-6">
            <h3 className="nrr-display text-xl mb-4">{season}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
              <StatCard label="Races" value={rows.length} />
              <StatCard label="Best Finish" value={placeSuffix(Math.min(...positions))} />
              <StatCard label="Avg Finish" value={(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1)} />
              <StatCard label="Best 5K" value={rows.filter((r) => r.result.distanceKm === 5).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0]?.result.totalTime || "Not available"} /><StatCard label="Best 2.5K" value={rows.filter((r) => r.result.distanceKm === 2.5).sort((a, b) => a.result.totalTimeSec - b.result.totalTimeSec)[0]?.result.totalTime || "Not available"} />
              <StatCard label="Podiums" value={podiums} />
            </div>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {rows.map(({ race, result }) => (
                <button key={race.id} onClick={() => goto("race", race.id)} className="nrr-focus flex items-center justify-between py-2.5 text-sm text-left">
                  <span>{race.raceName} <span style={{ color: "var(--slate)" }}>· {race.date}</span></span>
                  <span className="nrr-num">{placeSuffix(primaryPlace(result))}</span>
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ============================================================================
   TEAM PAGE
============================================================================ */
function TeamPage({ profile, teamMembers, myAthleteId, goto }) {
  const [rowsByAthlete, setRowsByAthlete] = useState({});
  useEffect(() => {
    Promise.all(teamMembers.map((a) => dataProvider.getAthleteResults(a.id))).then((lists) => {
      const map = {};
      teamMembers.forEach((a, i) => { map[a.id] = lists[i]; });
      setRowsByAthlete(map);
    });
  }, [teamMembers]);

  const allRows = Object.values(rowsByAthlete).flat();
  if (allRows.length === 0) return <div className="text-sm" style={{ color: "var(--slate)" }}>Loading team data…</div>;

  const best = allRows.reduce((min, r) => Math.min(min, r.result.overallPosition), Infinity);
  const allTimes = allRows.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
  const bestTimeSec = allTimes.length ? Math.min(...allTimes) : null;
  const bestTimeRow = bestTimeSec == null ? null : allRows.find((r) => r.result.totalTimeSec === bestTimeSec);
  const podiums = allRows.filter((r) => r.result.overallPosition <= 3).length;
  const raceCount = new Set(allRows.map((r) => r.race.id)).size;
  const currentSeason = [...new Set(allRows.map((r) => r.race.season))].sort().pop();
  const currentSeasonRows = allRows.filter((r) => r.race.season === currentSeason);

  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">{profile.team}</h1>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Team Overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Identified Athletes" value={teamMembers.length} />
          <StatCard label="Races" value={raceCount} />
          <StatCard label="Best Individual Finish" value={placeSuffix(best)} />
          <StatCard label="Fastest Team Time" value={bestTimeRow?.result.totalTime} sub={`${bestTimeRow?.athleteId === myAthleteId ? "Me" : ""}`} />
          <StatCard label="Team Podiums" value={podiums} />
          <StatCard label="Current Season Races" value={new Set(currentSeasonRows.map((r) => r.race.id)).size} />
        </div>
        <div className="text-xs mt-4" style={{ color: "var(--slate)" }}>Application-calculated statistics — Endurance Promotions does not publish an official team standing for this event type.</div>
      </Card>
    </div>
  );
}

/* ============================================================================
   ROSTER PAGE
============================================================================ */
function RosterPage({ profile, teamMembers, myAthleteId, appState, setAppState, goto }) {
  const [rowsByAthlete, setRowsByAthlete] = useState({});
  useEffect(() => {
    Promise.all(teamMembers.map((a) => dataProvider.getAthleteResults(a.id))).then((lists) => {
      const map = {};
      teamMembers.forEach((a, i) => { map[a.id] = lists[i]; });
      setRowsByAthlete(map);
    });
  }, [teamMembers]);

  const latestSeason = [...new Set(Object.values(rowsByAthlete).flat().map((r) => r.race.season))].sort().pop();
  const statusFor = (a) => {
    if (appState.teammateOverrides[a.id]) return appState.teammateOverrides[a.id];
    const rows = rowsByAthlete[a.id] || [];
    if (latestSeason && rows.some((r) => r.race.season === latestSeason)) return "current";
    if (rows.length > 0) return "former";
    return "unknown";
  };
  const setStatus = (id, status) => setAppState((s) => ({ ...s, teammateOverrides: { ...s.teammateOverrides, [id]: status } }));

  // Each athlete belongs to the level of their MOST RECENT race.
  // This prevents an athlete who has raced both JV and varsity from appearing
  // in both rosters. Non-JV gendered fields such as "Boys Classic Results"
  // are treated as varsity, while explicit JV labels stay JV.
  const athleteRows = teamMembers.map((a) => {
    const results = (rowsByAthlete[a.id] || []).slice().sort((a, b) => {
      const dateDiff = new Date(b.race.date) - new Date(a.race.date);
      if (dateDiff !== 0) return dateDiff;
      return Number(b.race.id || 0) - Number(a.race.id || 0);
    });
    const latest = results[0] || null;
    return {
      athlete: a,
      results,
      latest,
      latestClass: latest ? rosterClassKey(latest.result.class, latest.race.raceName) : null,
    };
  });

  const rosterGroups = ROSTER_CLASS_ORDER.map((classKey) => {
    const rows = athleteRows
      .filter((row) => row.latest && row.latestClass === classKey);

    // Within each level, sort by the athlete's placement in their most recent
    // race: first on the team to last on the team.
    rows.sort((a, b) => {
      const placeDiff = primaryPlace(a.latest.result) - primaryPlace(b.latest.result);
      if (placeDiff !== 0) return placeDiff;
      return `${a.athlete.lastName} ${a.athlete.firstName}`.localeCompare(`${b.athlete.lastName} ${b.athlete.firstName}`);
    });
    return {
      classKey,
      rows: rows.map((row, index) => ({ ...row, teamPlace: index + 1 })),
    };
  }).filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <div>
        <h1 className="nrr-display text-3xl mb-1">Team Roster</h1>
        <p className="text-sm" style={{ color: "var(--slate)" }}>Most recent race first, then team finish from first to last within each class.</p>
      </div>
      {rosterGroups.map((group) => (
        <Card key={group.classKey} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="nrr-display text-xl">{group.classKey}</h2>
            <span className="text-xs" style={{ color: "var(--slate)" }}>{group.rows.length} athlete{group.rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {group.rows.map((r) => (
              <div key={`${group.classKey}-${r.athlete.id}`} className="flex items-center justify-between gap-4 py-3">
                <button onClick={() => goto("athlete", r.athlete.id)} className="nrr-focus text-left min-w-0">
                  <div className="font-medium truncate">{r.athlete.firstName} {r.athlete.lastName}{r.athlete.id === myAthleteId ? " (me)" : ""}</div>
                  <div className="text-xs" style={{ color: "var(--slate)" }}>{r.latest.race.raceName} · {r.latest.race.date}</div>
                </button>
                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right">
                    <div className="nrr-num font-semibold">{placeSuffix(r.teamPlace)}</div>
                    <div className="text-xs" style={{ color: "var(--slate)" }}>Team place</div>
                  </div>
                  <div className="nrr-num text-sm" style={{ color: "var(--slate)" }}>{r.latest.result.totalTime}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

    </div>
  );

}

/* ============================================================================
   PERFORMANCE PAGE
============================================================================ */
function PerformancePage({ myResults, goto }) {
  if (myResults.length === 0) return <div className="text-sm" style={{ color: "var(--slate)" }}>Not enough results yet to chart performance.</div>;
  const chartData = [...myResults].reverse().map((r, i) => ({ i: i + 1, place: primaryPlace(r.result), pace: pacePerKm(r.result.totalTimeSec, r.result.distanceKm), distance: r.result.distanceKm, name: r.race.raceName }));
  const seasons = [...new Set(myResults.map((r) => r.race.season))].sort();

  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">Performance</h1>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4"><h3 className="font-medium">Finish Position Over Time</h3><span className="text-xs" style={{ color: "var(--slate)" }}>Lower is better</span></div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ left: -20, right: 10 }}>
            <CartesianGrid stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} />
            <YAxis reversed tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip labelFormatter={() => ""} formatter={(v, n, p) => [placeSuffix(v), p.payload.name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
            <Line type="monotone" dataKey="place" stroke="var(--ice)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Pace Over Time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => fmtTime(v)} />
            <Tooltip labelFormatter={() => ""} formatter={(v, n, p) => [v == null ? "Not available" : `${fmtTime(v)}/km (${distanceLabel(p.payload.distance)})`, p.payload.name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
            <Line type="monotone" dataKey="pace" stroke="var(--gold)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Season Performance</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {seasons.map((season) => {
            const rows = myResults.filter((r) => r.race.season === season);
            const positions = rows.map((r) => primaryPlace(r.result));
            return (
              <Card key={season} className="p-4" style={{ background: "var(--frost)", border: "none" }}>
                <div className="font-medium mb-2">{season}</div>
                <div className="text-sm flex flex-col gap-1" style={{ color: "var(--ink-soft)" }}>
                  <div>Races: {rows.length}</div>
                  <div>Best Finish: {placeSuffix(Math.min(...positions))}</div>
                  <div>Average Finish: {(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1)}</div>
                  <div>Podiums: {rows.filter((r) => primaryPlace(r.result) <= 3).length}</div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ============================================================================
   PERSONAL BESTS
============================================================================ */
function BestsPage({ stats, myResults, goto }) {
  if (!stats) return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <div className="text-sm" style={{ color: "var(--slate)" }}>Not enough results yet.</div>
    </div>
  );
  const bySeason = {};
  myResults.forEach((r) => { (bySeason[r.race.season] ||= []).push(r); });
  let bestSeason = null, bestAvg = Infinity;
  Object.entries(bySeason).forEach(([season, rows]) => {
    const avg = rows.reduce((a, r) => a + r.result.overallPosition, 0) / rows.length;
    if (avg < bestAvg) { bestAvg = avg; bestSeason = season; }
  });
  const mostPodiumsSeason = Object.entries(bySeason).map(([s, rows]) => [s, rows.filter((r) => r.result.overallPosition <= 3).length]).sort((a, b) => b[1] - a[1])[0];
  const bestClassFinish = Math.min(...myResults.map((r) => r.result.classPosition));
  const mostRecent = myResults[0];
  const mostRecentPodium = myResults.find((r) => r.result.overallPosition <= 3);

  const items = [
    { label: "Best Overall Finish", value: placeSuffix(stats.bestFinish) },
    { label: "Best Class Finish", value: placeSuffix(bestClassFinish) },
    { label: "Best 5K", value: stats.best5k },
    { label: "Best 2.5K", value: stats.best2_5k },
    { label: "Most Podiums in a Season", value: mostPodiumsSeason ? `${mostPodiumsSeason[1]} (${mostPodiumsSeason[0]})` : null },
    { label: "Best Season", value: bestSeason },
    { label: "Most Recent Race", value: mostRecent ? `${mostRecent.race.raceName} — ${placeSuffix(mostRecent.result.overallPosition)}` : null },
    { label: "Most Recent Podium", value: mostRecentPodium ? `${mostRecentPodium.race.raceName} — ${placeSuffix(mostRecentPodium.result.overallPosition)}` : "None yet" },
  ].filter((i) => i.value);

  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">Personal Bests</h1>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((i) => (
          <Card key={i.label} className="p-5 flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{i.label}</span>
            <span className="nrr-display nrr-num text-xl">{i.value}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   COMPARE PAGE
============================================================================ */
function ComparePage({ meId, otherId, goto, athletes }) {
  const [mine, setMine] = useState(null);
  const [theirs, setTheirs] = useState(null);
  useEffect(() => { dataProvider.getAthleteResults(meId).then(setMine); dataProvider.getAthleteResults(otherId).then(setTheirs); }, [meId, otherId]);
  const other = athletes.find((a) => a.id === otherId);
  if (!other) return <div className="text-sm" style={{ color: "var(--slate)" }}>Athlete not found.</div>;
  if (!mine || !theirs) return <div className="text-sm" style={{ color: "var(--slate)" }}>Loading…</div>;

  const allShared = mine.map((m) => {
    const t = theirs.find((x) => x.race.id === m.race.id);
    return t ? { race: m.race, mine: m.result, theirs: t.result } : null;
  }).filter(Boolean);

  // Only compare results from the same race AND the same distance.
  // JV is 2.5K and Varsity is 5K, so raw times/finishing speed across
  // those categories are not directly comparable.
  const shared = allShared.filter((s) =>
    s.mine.distanceKm != null &&
    s.theirs.distanceKm != null &&
    s.mine.distanceKm === s.theirs.distanceKm
  );

  const myWins = shared.filter((s) => s.mine.overallPosition < s.theirs.overallPosition).length;
  const theirWins = shared.filter((s) => s.theirs.overallPosition < s.mine.overallPosition).length;
  const excludedDifferentDistance = allShared.length - shared.length;

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => goto("roster")} className="nrr-focus text-xs flex items-center gap-1" style={{ color: "var(--slate)" }}><ChevronLeft size={14} /> Back</button>
      <h1 className="nrr-display text-3xl">Me vs. {other.firstName} {other.lastName}</h1>
      {shared.length === 0 ? (
        <Card className="p-6 text-sm" style={{ color: "var(--slate)" }}>No shared races found between these two athletes.</Card>
      ) : (
        <>
          <Card className="p-6">
            <h3 className="font-medium mb-4">Head-to-Head</h3>
            <div className="flex items-center gap-8">
              <div><div className="nrr-display nrr-num text-4xl">{myWins}</div><div className="text-sm" style={{ color: "var(--slate)" }}>Me</div></div>
              <div className="text-sm" style={{ color: "var(--slate)" }}>of {shared.length} comparable races</div>
              <div className="text-right"><div className="nrr-display nrr-num text-4xl">{theirWins}</div><div className="text-sm" style={{ color: "var(--slate)" }}>{other.firstName}</div></div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-medium mb-1">Shared Races</h3>
            <div className="text-xs mb-4" style={{ color: "var(--slate)" }}>
              Comparisons only use the same race distance.
              {excludedDifferentDistance > 0 ? ` ${excludedDifferentDistance} shared race${excludedDifferentDistance === 1 ? "" : "s"} excluded because the distances differ.` : ""}
            </div>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {shared.map((s) => (
                <div key={s.race.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{s.race.raceName} <span style={{ color: "var(--slate)" }}>· {s.race.date} · {distanceLabel(s.mine.distanceKm)}</span></span>
                  <span className="nrr-num">{placeSuffix(s.mine.overallPosition)} vs {placeSuffix(s.theirs.overallPosition)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ============================================================================
   SETTINGS
============================================================================ */
function SettingsPage({ appState, setAppState, onRefresh, refreshing, exportCSV, goto, combined }) {
  const [form, setForm] = useState(appState.profile);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const removedRaces = combined.races.filter((r) => appState.removedRaceIds.includes(r.id));
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const fileInputRef = React.useRef(null);

  const runImport = (text) => {
    setImportError(""); setImportNotice("");
    try {
      const parsedRaces = parseScraperExport(text);
      setAppState((s) => {
        setImportNotice(`Imported ${parsedRaces.length} race${parsedRaces.length === 1 ? "" : "s"}.`);
        return { ...s, importedRaces: parsedRaces, lastRefresh: new Date().toISOString(), confirmedMatches: {} };
      });
      setImportText("");
    } catch (err) {
      setImportError(err.message || "Couldn't parse that file.");
    }
  };

  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result));
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <BackToDashboard goto={goto} />
      <h1 className="nrr-display text-3xl">Settings</h1>

      <Card className="p-6">
        <h3 className="font-medium mb-4">Athlete Profile</h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          const profile = {
            ...form,
            aliases: Array.isArray(form.aliases) ? form.aliases : String(form.aliases || "").split(",").map((a) => a.trim()).filter(Boolean),
          };
          setAppState((s) => ({
            ...s,
            profile,
            // Changing the athlete identity starts a fresh match-review session.
            confirmedMatches: {},
            teammateOverrides: {},
          }));
          setSaveNotice(canUseLocalStorage() ? "Profile saved ✓ It will still be here after you refresh." : "Profile updated for this session, but browser storage is unavailable.");
        }} className="grid grid-cols-2 gap-4">
          <Field label="First name" value={form.firstName} onChange={set("firstName")} />
          <Field label="Last name" value={form.lastName} onChange={set("lastName")} />
          <Field label="Preferred name" value={form.preferredName || ""} onChange={set("preferredName")} />
          <Field label="City" value={form.city} onChange={set("city")} />
          <Field label="School" value={form.school} onChange={set("school")} />
          <Field label="Team" value={form.team} onChange={set("team")} />
          <div className="col-span-2">
            <Field label="Other name spellings (comma separated)" value={Array.isArray(form.aliases) ? form.aliases.join(", ") : (form.aliases || "")} onChange={set("aliases")} placeholder="Optional" />
          </div>
          <Button type="submit" variant="ice" className="col-span-2">Save profile</Button>
          {saveNotice && <div className="col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: "var(--ice-soft)", color: "var(--ice)" }}>{saveNotice}</div>}
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-medium mb-2">Data</h3>
        <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>Results imported from your scraper/API are cached locally. Refresh uses the configured results API; the browser does not fabricate or scrape data itself.</p>
        <p className="text-xs mb-4" style={{ color: "var(--slate)" }}>Refresh endpoint: <code className="nrr-num">VITE_RESULTS_API_URL</code> (must return the scraper JSON format).</p>
        {appState.lastRefresh && <p className="text-xs mb-3" style={{ color: "var(--slate)" }}>Last updated: {new Date(appState.lastRefresh).toLocaleString()}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={RefreshCw} onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh Results"}</Button>
          <Button variant="outline" icon={Download} onClick={exportCSV}>Export Results (CSV)</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-medium mb-1">Import Scraped Results</h3>
        <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>
          Upload or paste the <code className="nrr-num">results.json</code> produced by the scraper. Imported races are merged into the real results dataset and matched to teammates and your profile the same way as everything else.
        </p>
        {appState.importedRaces.length > 0 && (
          <div className="text-xs px-3 py-2 rounded-lg mb-3" style={{ background: "var(--ice-soft)", color: "var(--ice)" }}>
            {appState.importedRaces.length} imported race{appState.importedRaces.length === 1 ? "" : "s"} currently loaded.
          </div>
        )}
        <div className="flex flex-col gap-3">
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste the contents of results.json here…"
            rows={4} className="nrr-focus text-xs font-mono rounded-lg px-3 py-2 border" style={{ borderColor: "var(--border)" }} />
          {importError && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "#FBEAEA", color: "#9B2C2C" }}>{importError}</div>}
          {importNotice && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>{importNotice}</div>}
          <div className="flex flex-wrap gap-2">
            <Button variant="ice" size="sm" onClick={() => importText.trim() && runImport(importText)} disabled={!importText.trim()}>Import Pasted JSON</Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Upload results.json</Button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={onFileChosen} className="hidden" />
            {appState.importedRaces.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setAppState((s) => ({ ...s, importedRaces: [] }))}>Clear Imported Data</Button>
            )}
          </div>
        </div>
      </Card>

      {removedRaces.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-3">Removed Races</h3>
          <div className="flex flex-col gap-2">
            {removedRaces.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.raceName} · {r.date}</span>
                <button className="nrr-focus text-xs" style={{ color: "var(--ice)" }}
                  onClick={() => setAppState((s) => ({ ...s, removedRaceIds: s.removedRaceIds.filter((id) => id !== r.id) }))}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6" style={{ borderColor: "#F3D8D8" }}>
        <h3 className="font-medium mb-2">Account</h3>
        <Button variant="outline" icon={LogOut} onClick={() => setAppState((s) => ({ ...s, sessionEmail: null, profile: null, confirmedMatches: {}, teammateOverrides: {} }))}>Log out</Button>
      </Card>
    </div>
  );
}
