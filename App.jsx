import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Snowflake, ChevronRight, ChevronLeft, Search, RefreshCw, ExternalLink,
  Trophy, Users, TrendingUp, Award, Calendar, Settings as SettingsIcon,
  LogOut, ArrowUpRight, ArrowDownRight, Minus, Check, X, Filter,
  Download, Eye, EyeOff, ChevronDown, MapPin, Flag, Menu,
} from "lucide-react";

/* ============================================================================
   FONTS + GLOBAL TOKENS
   Palette: snow white surfaces, deep spruce/navy ink, one icy-blue accent,
   a muted gold for podiums. Display face "Fraunces" (sharp, editorial,
   slightly cold) for numerals/headlines; "Inter" for body/UI text.
============================================================================ */
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
      const res = r.results.find((x) => x.athleteId === athleteId);
      if (res) rows.push({ race: r, result: res });
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
  const sourceId = a.sourceAthleteId || a.athleteId;
  if (sourceId) return `source:${normalizeIdentity(sourceId)}`;
  const name = normalizeIdentity(`${a.firstName || ""} ${a.lastName || ""}`);
  const school = normalizeIdentity(a.school);
  const team = normalizeIdentity(a.team);
  return school ? `person:${name}|school:${school}` : `person:${name}|team:${team}`;
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
function normalizeRow(r, source) {
  if (source === "txt") {
    const { firstName, lastName } = splitFullName(r.name);
    return {
      firstName, lastName, team: r.team || r.school || "", school: r.school || "",
      sourceAthleteId: r.athleteId || r.athleteID || r.athlete_id || r.personId || r.personID || "",
      class: r.grade || r.class || "", bib: r.bib || "", place: r.place || "",
      time: r.time || "", timeSec: parseTimeToSeconds(r.time),
    };
  }
  return {
    firstName: r.firstName || r.firstname || r.first_name || "", lastName: r.lastName || r.lastname || r.last_name || "",
    team: r.team || r.school || "", school: r.school || "",
    sourceAthleteId: r.athleteId || r.athleteID || r.athlete_id || r.personId || r.personID || "",
    class: r.class || r.grade || "", bib: r.bib || r.bibNumber || "", place: r.place || r.position || "",
    time: r.time || r.totalTime || r.resultTime || "", timeSec: parseTimeToSeconds(r.time || r.totalTime || r.resultTime),
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
    const raceKey = [m.sourceUrl || "", m.event || "", m.raceDate || "", m.raceLabel || m.race || "", m.raceLocation || ""].map(normalizeIdentity).join("|");
    if (!byRace.has(raceKey)) {
      const date = normalizeDate(m.raceDate);
      byRace.set(raceKey, {
        id: `imp_${byRace.size + 1}`,
        raceName: m.event || "Imported Race",
        date, season: seasonFor(date),
        location: m.raceLocation || "Not available",
        discipline: guessDiscipline(m.event, m.raceLabel),
        distanceKm: null,
        sourceUrl: m.sourceUrl || "https://www.endurancepromotions.com/Results.aspx",
        source: "endurance-promotions-import",
        rawRows: [], seen: new Set(),
      });
    }
    const race = byRace.get(raceKey);
    const rows = m.fullField && m.fullField.length ? m.fullField : [m.row];
    rows.forEach((r) => {
      const norm = normalizeRow(r, m.source);
      const dedupeKey = `${norm.firstName}|${norm.lastName}|${norm.bib}`;
      if (race.seen.has(dedupeKey)) return;
      race.seen.add(dedupeKey);
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
    const winnerTime = ordered.find((r) => r.timeSec != null)?.timeSec ?? null;
    const classCounters = {};
    const results = ordered.map((r, i) => {
      classCounters[r.class] = (classCounters[r.class] || 0) + 1;
      return {
        id: `${race.id}_r${i}`,
        raceId: race.id,
        firstName: r.firstName, lastName: r.lastName, team: r.team, school: r.school, sourceAthleteId: r.sourceAthleteId || "",
        class: r.class || "Not available", classPosition: classCounters[r.class],
        bib: r.bib || "Not available",
        overallPosition: allHavePlace ? parseInt(r.place, 10) : i + 1,
        totalTimeSec: r.timeSec, totalTime: r.timeSec != null ? fmtTime(r.timeSec) : (r.time || "Not available"),
        timeGapSec: r.timeSec != null && winnerTime != null ? r.timeSec - winnerTime : null,
      };
    });
    return {
      id: race.id, raceName: race.raceName, date: race.date, season: race.season,
      location: race.location, discipline: race.discipline, distanceKm: race.distanceKm,
      sourceUrl: race.sourceUrl, source: race.source, fieldSize: results.length, results,
    };
  }).filter((r) => r.date); // drop races we couldn't get a real date for

  return races;
}

/** Assigns stable athlete ids to imported rows. Prefer a source-provided
 *  athlete id; otherwise use normalized name + school so changing teams does
 *  not automatically create a new athlete. */
function buildCombinedDataset(importedRaces) {
  const races = Array.isArray(importedRaces) ? importedRaces.map((race) => ({
    ...race,
    results: (race.results || []).map((r) => ({ ...r, athleteId: r.athleteId || `imp_ath_${stableHash(athleteIdentityKey(r))}` })),
  })) : [];
  const registry = new Map();
  races.forEach((race) => race.results.forEach((r) => {
    const id = r.athleteId;
    const existing = registry.get(id);
    if (!existing) {
      registry.set(id, {
        id, firstName: r.firstName || "", lastName: r.lastName || "",
        team: r.team || "", school: r.school || "", city: r.city || "",
        gender: r.gender || "", sourceAthleteId: r.sourceAthleteId || "",
      });
    } else {
      registry.set(id, { ...existing, team: r.team || existing.team, school: r.school || existing.school, city: r.city || existing.city });
    }
  }));
  return { races, athletes: [...registry.values()] };
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
function gapLabel(sec) {
  if (sec < 0.05) return "Winner";
  return `+${sec.toFixed(1)}s`;
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
function MatchReview({ matches, decisions, onDecide }) {
  const pending = matches.filter((m) => !(m.athlete.id in decisions));
  if (pending.length === 0) return null;
  return (
    <Card className="p-5 mb-6" style={{ borderColor: "var(--ice-line)", background: "var(--ice-soft)" }}>
      <div className="flex items-start gap-3">
        <Eye size={18} style={{ color: "var(--ice)" }} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="font-medium mb-1">Is this you?</h3>
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            We found {pending.length} additional athlete{pending.length > 1 ? "s" : ""} with your name we're not fully sure about.
          </p>
          <div className="flex flex-col gap-3">
            {pending.map((m) => (
              <div key={m.athlete.id} className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4 justify-between" style={{ borderColor: "var(--border)" }}>
                <div className="text-sm">
                  <div className="font-medium">{m.athlete.firstName} {m.athlete.lastName}</div>
                  <div style={{ color: "var(--slate)" }}>{m.athlete.team} · {m.athlete.school} · {m.athlete.city}</div>
                  <div className="mt-1"><Pill tone="ice">{Math.round(m.confidence * 100)}% match confidence</Pill></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={X} onClick={() => onDecide(m.athlete.id, "not-me")}>Not me</Button>
                  <Button size="sm" variant="ice" icon={Check} onClick={() => onDecide(m.athlete.id, "me")}>Yes, this is me</Button>
                </div>
              </div>
            ))}
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
  const idx = race.results.findIndex((r) => r.id === myResult.id);
  const window_ = race.results.slice(Math.max(0, idx - 2), Math.min(race.results.length, idx + 3));
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
              <div className="nrr-display nrr-num text-5xl leading-none">{placeSuffix(myResult.overallPosition)}</div>
              <div className="text-sm mt-1" style={{ color: "var(--slate)" }}>Overall · {race.fieldSize} finishers</div>
            </div>
            <div className="nrr-num text-2xl">{myResult.totalTime}</div>
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--ink-soft)" }}>
              <div><span style={{ color: "var(--slate)" }}>Class place</span><br />{placeSuffix(myResult.classPosition)} ({myResult.class})</div>
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
          <h3 className="font-medium mb-4">Around Me</h3>
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

  const bestFinish = Math.min(...rows.map((r) => r.result.overallPosition));
  const avgFinish = (rows.reduce((s, r) => s + r.result.overallPosition, 0) / rows.length).toFixed(1);
  const athleteTimes = rows.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
  const bestTimeSec = athleteTimes.length ? Math.min(...athleteTimes) : null;
  const bestTime = bestTimeSec == null ? "Not available" : rows.find((r) => r.result.totalTimeSec === bestTimeSec)?.result.totalTime;
  const podiums = rows.filter((r) => r.result.overallPosition <= 3).length;

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
        <StatCard label="Podiums" value={podiums} />
      </div>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Race History</h3>
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {rows.map(({ race, result }) => (
            <div key={race.id} className="flex flex-wrap items-center justify-between py-3 text-sm gap-2">
              <div>
                <div className="font-medium">{race.raceName}</div>
                <div style={{ color: "var(--slate)" }}>{race.date} · {race.discipline} · {result.class}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="nrr-num">{placeSuffix(result.overallPosition)}</span>
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
   MAIN APP
============================================================================ */
export default function App() {
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

  useEffect(() => {
    if (hasProfile) dataProvider.findPossibleMatches(appState.profile).then(setMatches);
  }, [hasProfile, appState.profile, combined]);

  const myAthleteId = useMemo(() => {
    if (!hasProfile) return null;
    const confirmed = Object.entries(appState.confirmedMatches).find(([, decision]) => decision === "me");
    if (confirmed?.[0] && combined.athletes.some((a) => a.id === confirmed[0])) return confirmed[0];
    const profileName = normalizeIdentity(`${appState.profile.firstName} ${appState.profile.lastName}`);
    const exact = combined.athletes.find((a) => {
      const sameName = normalizeIdentity(`${a.firstName} ${a.lastName}`) === profileName;
      const sameSchool = !appState.profile.school || !a.school || normalizeIdentity(a.school) === normalizeIdentity(appState.profile.school);
      const sameTeam = !appState.profile.team || !a.team || normalizeIdentity(a.team) === normalizeIdentity(appState.profile.team);
      return sameName && sameSchool && sameTeam;
    });
    return exact?.id || null;
  }, [hasProfile, appState.profile, appState.confirmedMatches, combined]);

  const confirmedMeIds = useMemo(() => {
    const ids = new Set(myAthleteId ? [myAthleteId] : []);
    Object.entries(appState.confirmedMatches).forEach(([id, d]) => { if (d === "me") ids.add(id); });
    return ids;
  }, [myAthleteId, appState.confirmedMatches]);

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
    const positions = myResults.map((r) => r.result.overallPosition);
    const times = myResults.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
    const podiums = { 1: 0, 2: 0, 3: 0 };
    myResults.forEach((r) => { if (r.result.overallPosition <= 3) podiums[r.result.overallPosition]++; });
    const years = myResults.map((r) => r.race.date.slice(0, 4));
    return {
      races: myResults.length,
      bestFinish: Math.min(...positions),
      avgFinish: (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1),
      bestTimeSec: times.length ? Math.min(...times) : null,
      bestTime: times.length ? myResults.find((r) => r.result.totalTimeSec === Math.min(...times))?.result.totalTime : "Not available",
      podiums,
      totalPodiums: podiums[1] + podiums[2] + podiums[3],
      seasons: seasons.length,
      firstYear: Math.min(...years), lastYear: Math.max(...years),
    };
  }, [myResults, seasons]);

  const teamMembers = useMemo(() => {
    if (!appState.profile) return [];
    return combined.athletes.filter((a) => (a.team || "").toLowerCase() === appState.profile.team.toLowerCase());
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
      setAppState((s) => {
        const merged = [...s.importedRaces];
        r.races.forEach((race) => {
          const key = `${normalizeIdentity(race.raceName)}|${race.date}|${normalizeIdentity(race.location)}|${normalizeIdentity(race.discipline)}`;
          const idx = merged.findIndex((m) => `${normalizeIdentity(m.raceName)}|${m.date}|${normalizeIdentity(m.location)}|${normalizeIdentity(m.discipline)}` === key);
          if (idx >= 0) merged[idx] = { ...race, id: merged[idx].id }; else merged.push(race);
        });
        return { ...s, importedRaces: merged, lastRefresh: r.updatedAt };
      });
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
      <ProfileSetup onSave={(form) => setAppState((s) => ({ ...s, profile: { ...form, aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean) } }))} />
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
          <button onClick={() => setAppState((s) => ({ ...s, sessionEmail: null }))} className="nrr-focus flex items-center gap-1.5 text-xs" style={{ color: "var(--slate)" }}>
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
            <Dashboard appState={appState} stats={stats} myResults={myResults} goto={goto} teamMembers={teamMembers} matches={matches}
              onDecide={(id, d) => setAppState((s) => ({ ...s, confirmedMatches: { ...s.confirmedMatches, [id]: d } }))}
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
   DASHBOARD
============================================================================ */
function Dashboard({ appState, stats, myResults, goto, teamMembers, matches, onDecide, onRefresh, refreshing }) {
  const latest = myResults[0];
  const chartData = [...myResults].reverse().map((r, i) => ({ i: i + 1, date: r.race.date, place: r.result.overallPosition, name: r.race.raceName }));
  const p = appState.profile;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="nrr-display text-3xl mb-1">{p.firstName} {p.lastName}</h1>
          <div className="text-sm" style={{ color: "var(--slate)" }}>
            {p.team} · {p.school}{stats ? ` · Racing ${stats.firstYear}–${stats.lastYear}` : ""}
          </div>
        </div>
        <Button variant="outline" icon={RefreshCw} onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh Results"}</Button>
      </div>
      {appState.lastRefresh && <div className="text-xs -mt-4" style={{ color: "var(--slate)" }}>Last updated: {new Date(appState.lastRefresh).toLocaleString()}</div>}

      <MatchReview matches={matches} decisions={appState.confirmedMatches} onDecide={onDecide} />

      {!stats ? (
        <Card className="p-8 text-center">
          <p className="mb-1 font-medium">No race results found yet.</p>
          <p className="text-sm mb-4" style={{ color: "var(--slate)" }}>Double-check the details on your athlete profile.</p>
          <Button variant="ice" onClick={() => goto("settings")}>Check Athlete Profile</Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <StatCard label="Races" value={stats.races} icon={Flag} />
            <StatCard label="Best Finish" value={placeSuffix(stats.bestFinish)} icon={Trophy} />
            <StatCard label="Fastest Time" value={stats.bestTime} icon={TrendingUp} />
            <StatCard label="Podiums" value={stats.totalPodiums} sub={`${stats.podiums[1]} 1st · ${stats.podiums[2]} 2nd · ${stats.podiums[3]} 3rd`} icon={Award} />
            <StatCard label="Seasons" value={stats.seasons} icon={Calendar} />
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Finish Position Over Time</h3>
              <span className="text-xs" style={{ color: "var(--slate)" }}>Lower is better</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ left: -20, right: 10 }}>
                <CartesianGrid stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} />
                <YAxis reversed tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v, n, p2) => [`${placeSuffix(v)}`, p2.payload.name]} labelFormatter={() => ""} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
                <Line type="monotone" dataKey="place" stroke="var(--ice)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Recent Results</h3>
              <button onClick={() => goto("results")} className="nrr-focus text-xs flex items-center gap-0.5" style={{ color: "var(--ice)" }}>View all <ChevronRight size={13} /></button>
            </div>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {myResults.slice(0, 4).map(({ race, result }) => (
                <button key={race.id} onClick={() => goto("race", race.id)} className="nrr-focus flex items-center justify-between py-3 text-sm text-left w-full">
                  <div>
                    <div className="font-medium">{race.raceName}</div>
                    <div style={{ color: "var(--slate)" }}>{race.date} · {race.discipline}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="nrr-num">{placeSuffix(result.overallPosition)}</span>
                    <span className="nrr-num" style={{ color: "var(--slate)" }}>{result.totalTime}</span>
                    <ChevronRight size={14} style={{ color: "var(--slate)" }} />
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {latest && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Latest Race — {latest.race.raceName}</h3>
                <button onClick={() => goto("race", latest.race.id)} className="nrr-focus text-xs flex items-center gap-0.5" style={{ color: "var(--ice)" }}>Full results <ChevronRight size={13} /></button>
              </div>
              <div className="mb-4">
                <span className="nrr-display nrr-num text-3xl">{placeSuffix(latest.result.overallPosition)}</span>
                <span className="text-sm ml-3" style={{ color: "var(--slate)" }}>{latest.result.totalTime}</span>
              </div>
              <AroundMe race={latest.race} myResult={latest.result} />
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">My Team</h3>
              <button onClick={() => goto("roster")} className="nrr-focus text-xs flex items-center gap-0.5" style={{ color: "var(--ice)" }}>View roster <ChevronRight size={13} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {teamMembers.slice(0, 8).map((a) => (
                <Pill key={a.id}>{a.firstName} {a.lastName}</Pill>
              ))}
            </div>
          </Card>
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
                <div className="text-sm" style={{ color: "var(--slate)" }}>{race.location} · {race.discipline}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="nrr-num nrr-display text-xl">{placeSuffix(result.overallPosition)}</div>
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
        const positions = rows.map((r) => r.result.overallPosition);
        const times = rows.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
        const podiums = rows.filter((r) => r.result.overallPosition <= 3).length;
        const bestTime = times.length ? rows.find((r) => r.result.totalTimeSec === Math.min(...times))?.result.totalTime : "Not available";
        return (
          <Card key={season} className="p-6">
            <h3 className="nrr-display text-xl mb-4">{season}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
              <StatCard label="Races" value={rows.length} />
              <StatCard label="Best Finish" value={placeSuffix(Math.min(...positions))} />
              <StatCard label="Avg Finish" value={(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1)} />
              <StatCard label="Fastest Time" value={bestTime} />
              <StatCard label="Podiums" value={podiums} />
            </div>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {rows.map(({ race, result }) => (
                <button key={race.id} onClick={() => goto("race", race.id)} className="nrr-focus flex items-center justify-between py-2.5 text-sm text-left">
                  <span>{race.raceName} <span style={{ color: "var(--slate)" }}>· {race.date}</span></span>
                  <span className="nrr-num">{placeSuffix(result.overallPosition)}</span>
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

  const rows = teamMembers.map((a) => {
    const results = rowsByAthlete[a.id] || [];
    if (results.length === 0) return { athlete: a, races: 0 };
    const positions = results.map((r) => r.result.overallPosition);
    const times = results.map((r) => r.result.totalTimeSec).filter((v) => Number.isFinite(v));
    return {
      athlete: a, races: results.length,
      bestFinish: Math.min(...positions),
      avgFinish: (positions.reduce((x, y) => x + y, 0) / positions.length).toFixed(1),
      bestTime: times.length ? results.find((r) => r.result.totalTimeSec === Math.min(...times))?.result.totalTime : "Not available",
      mostRecent: results.slice().sort((x, y) => (x.race.date < y.race.date ? 1 : -1))[0].race.raceName,
    };
  }).sort((a, b) => (a.bestFinish || 999) - (b.bestFinish || 999));

  return (
    <div className="flex flex-col gap-6">
      <BackToDashboard goto={goto} />
      <div>
        <h1 className="nrr-display text-3xl mb-1">Team Roster</h1>
        <p className="text-sm" style={{ color: "var(--slate)" }}>Athletes identified from available race results — categorize teammates as current, former, or not on your team.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {rows.map((r) => (
          <Card key={r.athlete.id} className="p-5" style={r.athlete.id === myAthleteId ? { borderColor: "var(--ice-line)", background: "var(--ice-soft)" } : {}}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <button onClick={() => goto("athlete", r.athlete.id)} className="nrr-focus text-left font-medium hover:underline">
                {r.athlete.firstName} {r.athlete.lastName}{r.athlete.id === myAthleteId ? " (me)" : ""}
              </button>
              <select value={statusFor(r.athlete)} onChange={(e) => setStatus(r.athlete.id, e.target.value)} className="nrr-focus text-xs border rounded-full px-2 py-1" style={{ borderColor: "var(--border)" }}>
                <option value="current">Current teammate</option>
                <option value="former">Former teammate</option>
                <option value="not-teammate">Not my teammate</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            {r.races > 0 ? (
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                <div style={{ color: "var(--slate)" }}>Races</div><div className="nrr-num text-right">{r.races}</div>
                <div style={{ color: "var(--slate)" }}>Best Finish</div><div className="nrr-num text-right">{placeSuffix(r.bestFinish)}</div>
                <div style={{ color: "var(--slate)" }}>Avg Finish</div><div className="nrr-num text-right">{r.avgFinish}</div>
                <div style={{ color: "var(--slate)" }}>Best Time</div><div className="nrr-num text-right">{r.bestTime}</div>
                <div style={{ color: "var(--slate)" }}>Most Recent</div><div className="text-right text-xs">{r.mostRecent}</div>
              </div>
            ) : <div className="text-sm" style={{ color: "var(--slate)" }}>No results yet</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   PERFORMANCE PAGE
============================================================================ */
function PerformancePage({ myResults, goto }) {
  if (myResults.length === 0) return <div className="text-sm" style={{ color: "var(--slate)" }}>Not enough results yet to chart performance.</div>;
  const chartData = [...myResults].reverse().map((r, i) => ({ i: i + 1, place: r.result.overallPosition, time: +r.result.totalTimeSec.toFixed(1), name: r.race.raceName }));
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
        <h3 className="font-medium mb-4">Race Time Over Time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#7A8699" }} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => fmtTime(v)} />
            <Tooltip labelFormatter={() => ""} formatter={(v, n, p) => [fmtTime(v), p.payload.name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }} />
            <Line type="monotone" dataKey="time" stroke="var(--gold)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-6">
        <h3 className="font-medium mb-4">Season Performance</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {seasons.map((season) => {
            const rows = myResults.filter((r) => r.race.season === season);
            const positions = rows.map((r) => r.result.overallPosition);
            return (
              <Card key={season} className="p-4" style={{ background: "var(--frost)", border: "none" }}>
                <div className="font-medium mb-2">{season}</div>
                <div className="text-sm flex flex-col gap-1" style={{ color: "var(--ink-soft)" }}>
                  <div>Races: {rows.length}</div>
                  <div>Best Finish: {placeSuffix(Math.min(...positions))}</div>
                  <div>Average Finish: {(positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1)}</div>
                  <div>Podiums: {rows.filter((r) => r.result.overallPosition <= 3).length}</div>
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
    { label: "Fastest Race Time", value: stats.bestTime },
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
  if (!mine || !theirs) return <div className="text-sm" style={{ color: "var(--slate)" }}>Loading…</div>;

  const shared = mine.map((m) => {
    const t = theirs.find((x) => x.race.id === m.race.id);
    return t ? { race: m.race, mine: m.result, theirs: t.result } : null;
  }).filter(Boolean);

  const myWins = shared.filter((s) => s.mine.overallPosition < s.theirs.overallPosition).length;
  const theirWins = shared.filter((s) => s.theirs.overallPosition < s.mine.overallPosition).length;

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
              <div className="text-sm" style={{ color: "var(--slate)" }}>of {shared.length} shared races</div>
              <div className="text-right"><div className="nrr-display nrr-num text-4xl">{theirWins}</div><div className="text-sm" style={{ color: "var(--slate)" }}>{other.firstName}</div></div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-medium mb-4">Shared Races</h3>
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {shared.map((s) => (
                <div key={s.race.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{s.race.raceName} <span style={{ color: "var(--slate)" }}>· {s.race.date}</span></span>
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
        const merged = [...s.importedRaces];
        let added = 0, updated = 0;
        parsedRaces.forEach((r) => {
          const key = `${normalizeIdentity(r.raceName)}|${r.date}|${normalizeIdentity(r.location)}|${normalizeIdentity(r.discipline)}`;
          const idx = merged.findIndex((m) => `${normalizeIdentity(m.raceName)}|${m.date}|${normalizeIdentity(m.location)}|${normalizeIdentity(m.discipline)}` === key);
          if (idx >= 0) { merged[idx] = { ...r, id: merged[idx].id }; updated++; }
          else { merged.push(r); added++; }
        });
        setImportNotice(`Imported ${parsedRaces.length} race${parsedRaces.length === 1 ? "" : "s"} (${added} new, ${updated} updated).`);
        return { ...s, importedRaces: merged, lastRefresh: new Date().toISOString() };
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
          setAppState((s) => ({ ...s, profile }));
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
        <Button variant="outline" icon={LogOut} onClick={() => setAppState((s) => ({ ...s, sessionEmail: null }))}>Log out</Button>
      </Card>
    </div>
  );
}
