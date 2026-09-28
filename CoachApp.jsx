import React, { useMemo, useState } from "react";
import {
  Snowflake, Users, Flag, TrendingUp, Calendar, Settings as SettingsIcon,
  LogOut, Search, ChevronRight, ChevronLeft, Menu, Award,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const TEAM_NAME = "Mahtomedi";
const CLASS_ORDER = ["GVAR", "BVAR", "GJV", "BJV"];
const CLASS_LABELS = {
  GVAR: "Girls Varsity",
  BVAR: "Boys Varsity",
  GJV: "Girls JV",
  BJV: "Boys JV",
};

const Card = ({ children, className = "", style }) => (
  <div className={`bg-white/55 backdrop-blur-2xl border rounded-2xl shadow-[0_12px_38px_rgba(67,119,154,0.12)] ${className}`} style={{ borderColor: "rgba(188,222,242,.92)", background: "linear-gradient(145deg, rgba(255,255,255,.82), rgba(225,243,253,.58))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.95), 0 12px 38px rgba(67,119,154,.12)", ...style }}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", size = "md", icon: Icon, className = "" }) => {
  const base = "nrr-focus inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors";
  const sizes = { md: "px-4 py-2 text-sm", sm: "px-3 py-1.5 text-xs" };
  const variants = {
    primary: { background: "var(--ink)", color: "white" },
    outline: { background: "white", color: "var(--ink)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--ink-soft)" },
    ice: { background: "var(--ice)", color: "white" },
  };
  return <button onClick={onClick} className={`${base} ${sizes[size]} ${className}`} style={variants[variant]}>{Icon && <Icon size={14} strokeWidth={2.2} />}{children}</button>;
};

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

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizeIdentity = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const displayTime = (sec) => {
  if (!Number.isFinite(Number(sec))) return "—";
  const total = Math.max(0, Math.round(Number(sec)));
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
};
const place = (r) => Number.isFinite(Number(r?.fieldPosition)) ? Number(r.fieldPosition) : (Number.isFinite(Number(r?.classPosition)) ? Number(r.classPosition) : Number(r?.overallPosition));
const placeLabel = (n) => {
  if (!Number.isFinite(Number(n))) return "—";
  const x = Number(n), j = x % 10, k = x % 100;
  return `${x}${j === 1 && k !== 11 ? "st" : j === 2 && k !== 12 ? "nd" : j === 3 && k !== 13 ? "rd" : "th"}`;
};
const dateLabel = (value) => {
  if (!value) return "Date not listed";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const seasonFor = (isoDate) => {
  if (!isoDate) return "Unknown Season";
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-/);
  if (!m) return "Unknown Season";
  const y = Number(m[1]), month = Number(m[2]);
  return month >= 7 ? `${y}–${String(y + 1).slice(2)}` : `${y - 1}–${String(y).slice(2)}`;
};
const raceSeason = (race) => {
  const byDate = seasonFor(race?.date);
  if (byDate !== "Unknown Season") return byDate;
  const raw = String(race?.season || "").trim();
  const m = raw.match(/^(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/);
  if (m) return `${m[1]}–${m[2].length === 4 ? m[2].slice(2) : m[2]}`;
  return raw || "Unknown Season";
};
const teamMatch = (value) => normalize(value).includes(normalize(TEAM_NAME));

function rosterClassKey(result = {}, raceName = "") {
  const raw = `${result.field || ""} ${result.class || ""} ${result.gender || ""}`;
  const key = normalizeIdentity(raw).replace(/\s+/g, "").toUpperCase();
  const race = normalizeIdentity(raceName).replace(/\s+/g, "").toUpperCase();
  if (/\bconference\b/i.test(raceName)) {
    if (key.includes("GIRL") || key.includes("FEMALE") || key.includes("WOMEN") || key === "F" || key.includes("FVAR") || key.includes("VARG")) return "GVAR";
    if (key.includes("BOY") || key.includes("MALE") || key.includes("MEN") || key === "M" || key.includes("BVAR") || key.includes("VARB")) return "BVAR";
  }
  if (["GVAR", "VARG"].includes(key)) return "GVAR";
  if (["BVAR", "VARB"].includes(key)) return "BVAR";
  if (["GJV", "JVG"].includes(key)) return "GJV";
  if (["BJV", "JVB"].includes(key)) return "BJV";

  const isGirls = key.includes("GIRL") || key.includes("FEMALE") || key.includes("WOMEN") || key.includes("GJV") || key.includes("GVAR") || key.includes("JVG") || key.includes("VARG") || race.includes("GIRL") || race.includes("GIRLS");
  const isBoys = key.includes("BOY") || key.includes("MALE") || key.includes("MEN") || key.includes("BJV") || key.includes("BVAR") || key.includes("JVB") || key.includes("VARB") || race.includes("BOY") || race.includes("BOYS");
  const isJV = key.includes("JV") || key.includes("JUNIOR") || race.includes("JV") || race.includes("JUNIOR");
  const isVarsity = key.includes("VAR") || key.includes("VARSITY") || race.includes("VAR") || race.includes("VARSITY");
  if (isGirls && isJV) return "GJV";
  if (isBoys && isJV) return "BJV";
  if (isGirls && (isVarsity || key.includes("CLASSIC") || key.includes("SKATE") || key.includes("RELAY"))) return "GVAR";
  if (isBoys && (isVarsity || key.includes("CLASSIC") || key.includes("SKATE") || key.includes("RELAY"))) return "BVAR";
  if (isGirls) return "GVAR";
  if (isBoys) return "BVAR";
  return null;
}

function distanceForClass(classKey, result = {}, race = {}) {
  if (classKey === "GJV" || classKey === "BJV") return 2.5;
  if (classKey === "GVAR" || classKey === "BVAR") return 5;
  const d = Number(result.distanceKm ?? race.distanceKm);
  return Number.isFinite(d) ? d : null;
}

function resultPersonKey(result) {
  return normalizeIdentity(`${result?.firstName || ""} ${result?.lastName || ""}`);
}

function dedupeRaceResults(results) {
  const seen = new Map();
  for (const result of results || []) {
    const key = resultPersonKey(result) || String(result?.athleteId || "");
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, result);
      continue;
    }
    const a = Number(existing.totalTimeSec), b = Number(result.totalTimeSec);
    if (!Number.isFinite(a) && Number.isFinite(b)) seen.set(key, result);
    else if (Number.isFinite(a) && Number.isFinite(b) && b < a) seen.set(key, result);
  }
  return [...seen.values()];
}

function buildTeamAthletes(athletes, races) {
  const source = new Map();
  for (const a of athletes || []) {
    const hasHistoricalTeam = (races || []).some(r => (r.results || []).some(x => x.athleteId === a.id && (teamMatch(x.team) || teamMatch(x.school))));
    if (teamMatch(a.team) || teamMatch(a.school) || hasHistoricalTeam) {
      const key = normalizeIdentity(`${a.firstName} ${a.lastName}`);
      if (!key) continue;
      const existing = source.get(key);
      if (existing) {
        existing.sourceIds.push(a.id);
        existing.sourceIds = [...new Set(existing.sourceIds)];
      } else {
        source.set(key, { ...a, sourceIds: [a.id] });
      }
    }
  }

  return [...source.values()].map(a => {
    const sourceIds = new Set(a.sourceIds);
    const results = [];
    for (const race of races || []) {
      const matches = (race.results || []).filter(r => sourceIds.has(r.athleteId) || (resultPersonKey(r) === normalizeIdentity(`${a.firstName} ${a.lastName}`) && (teamMatch(r.team) || teamMatch(r.school))));
      const unique = dedupeRaceResults(matches).map(result => ({ race, result }));
      results.push(...unique);
    }
    return { ...a, results };
  });
}

function teamRaceResults(race, teamAthletes) {
  const names = new Set(teamAthletes.map(a => normalizeIdentity(`${a.firstName} ${a.lastName}`)));
  const ids = new Set(teamAthletes.flatMap(a => a.sourceIds || [a.id]));
  return dedupeRaceResults((race?.results || []).filter(r => ids.has(r.athleteId) || names.has(resultPersonKey(r)) || teamMatch(r.team) || teamMatch(r.school)));
}

function seasonOptionsFor(races, teamAthletes) {
  return [...new Set((races || []).filter(r => teamRaceResults(r, teamAthletes).length).map(r => raceSeason(r)).filter(Boolean))].sort((a,b) => String(b).localeCompare(String(a), undefined, {numeric:true}));
}

function seasonFilteredRaces(races, teamAthletes, seasonFilter) {
  return (races || []).filter(r => teamRaceResults(r, teamAthletes).length && (seasonFilter === "ALL" || raceSeason(r) === seasonFilter));
}

function classifyLatestForAthlete(athlete, seasonFilter = "ALL") {
  const rows = (athlete?.results || []).filter(x => seasonFilter === "ALL" || raceSeason(x.race) === seasonFilter).slice().sort((a,b) => {
    const d = String(b.race?.date || "").localeCompare(String(a.race?.date || ""));
    if (d) return d;
    return Number(b.race?.id || 0) - Number(a.race?.id || 0);
  });
  const latest = rows[0] || null;
  return latest ? { latest, classKey: rosterClassKey(latest.result, latest.race.raceName), rows } : { latest: null, classKey: null, rows };
}

function CoachDashboard({ races, teamAthletes, goto }) {
  const teamRows = races.flatMap(race => teamRaceResults(race, teamAthletes).map(result => ({ race, result })));
  const published = [...races].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const recent = published.find(r => teamRaceResults(r, teamAthletes).length) || null;
  const recentRows = recent ? teamRaceResults(recent, teamAthletes).sort((a, b) => place(a) - place(b)).slice(0, 8) : [];
  const timed = teamRows.map(x => Number(x.result.totalTimeSec)).filter(Number.isFinite);
  const avg = timed.length ? displayTime(timed.reduce((a, b) => a + b, 0) / timed.length) : "—";
  const seasonBest = timed.length ? displayTime(Math.min(...timed)) : "—";
  const raceCount = new Set(teamRows.map(x => x.race.id)).size;

  return <div className="flex flex-col gap-6">
    <div><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Coach Dashboard</div><h1 className="nrr-display text-3xl sm:text-4xl">{TEAM_NAME} Nordic</h1><p className="text-sm mt-1" style={{ color: "var(--slate)" }}>Team results and season information from the races already published in My Nordic Race Results.</p></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><StatCard label="Athletes" value={teamAthletes.length} icon={Users}/><StatCard label="Races" value={raceCount} icon={Flag}/><StatCard label="Average time" value={avg} icon={TrendingUp} sub="All available team results"/><StatCard label="Fastest result" value={seasonBest} icon={Award}/></div>
    <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-5">
      <Card className="p-5 sm:p-6"><div className="flex items-center justify-between mb-3"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Latest published race</div><h2 className="nrr-display text-2xl">{recent?.raceName || "No published team race yet"}</h2></div>{recent && <Button size="sm" variant="outline" onClick={() => goto("race", recent.id)} icon={ChevronRight}>View</Button>}</div>{recent && <><div className="text-xs mb-4" style={{ color: "var(--slate)" }}>{dateLabel(recent.date)} · {recent.location || "Location not listed"}</div><div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>{recentRows.map((r, i) => <div key={`${resultPersonKey(r)}-${i}`} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium truncate pr-3">{r.firstName} {r.lastName}</span><span className="flex items-center gap-4 shrink-0"><span className="text-xs" style={{ color: "var(--slate)" }}>{placeLabel(place(r))}</span><span className="nrr-num font-semibold">{r.totalTime || displayTime(r.totalTimeSec)}</span></span></div>)}</div></>}</Card>
      <Card className="p-5 sm:p-6"><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Quick access</div><div className="flex flex-col gap-2 mt-3"><Button variant="outline" className="justify-between" onClick={() => goto("athletes")}>Team roster <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("races")}>Race history <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("analytics")}>Team analytics <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("season")}>Season overview <ChevronRight size={14}/></Button></div></Card>
    </div>
  </div>;
}

function AthletesPage({ teamAthletes, goto }) {
  const seasons = seasonOptionsFor(teamAthletes.flatMap(a=>a.results.map(x=>x.race)), teamAthletes);
  const [selectedSeason,setSelectedSeason]=useState(seasons[0]||"");
  const activeSeason=selectedSeason && seasons.includes(selectedSeason)?selectedSeason:(seasons[0]||"");
  const rosterGroups=CLASS_ORDER.map(classKey=>{
    const rows=teamAthletes.map(a=>{
      const assignment=classifyLatestForAthlete(a,activeSeason);
      if(assignment.classKey!==classKey || !assignment.latest) return null;
      return {athlete:a,latest:assignment.latest};
    }).filter(Boolean).sort((a,b)=>{
      const ta=Number(a.latest.result.totalTimeSec), tb=Number(b.latest.result.totalTimeSec);
      if(Number.isFinite(ta)&&Number.isFinite(tb)) return ta-tb;
      if(Number.isFinite(ta)!==Number.isFinite(tb)) return Number.isFinite(ta)?-1:1;
      return `${a.athlete.lastName} ${a.athlete.firstName}`.localeCompare(`${b.athlete.lastName} ${b.athlete.firstName}`);
    });
    return {classKey,rows};
  });
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Athletes</div><h1 className="nrr-display text-3xl sm:text-4xl">Team Roster</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>Each athlete appears once, based on their most recent race in the selected season.</p></div><div><label className="block text-xs font-medium mb-1" style={{color:"var(--slate)"}}>Season</label><select value={activeSeason} onChange={e=>setSelectedSeason(e.target.value)} className="nrr-focus rounded-lg border px-3 py-2 text-sm bg-white" style={{borderColor:"var(--border)",color:"var(--ink)"}}>{seasons.map((s,i)=><option key={s} value={s}>{i===0?`Current Season (${s})`:s}</option>)}</select></div></div>{rosterGroups.map(({classKey,rows})=><Card key={classKey} className="p-5"><div className="flex items-center justify-between mb-4"><h2 className="nrr-display text-xl">{CLASS_LABELS[classKey]}</h2><span className="text-xs" style={{color:"var(--slate)"}}>{rows.length} athlete{rows.length===1?"":"s"}</span></div>{rows.length===0?<div className="text-sm py-3" style={{color:"var(--slate)"}}>No athletes in this group.</div>:<div className="flex flex-col divide-y" style={{borderColor:"var(--border-soft)"}}>{rows.map((r,index)=><div key={`${classKey}-${r.athlete.id}`} className="flex items-center justify-between gap-4 py-3"><button onClick={()=>goto("athlete",r.athlete.id)} className="nrr-focus text-left min-w-0"><div className="font-medium truncate">{r.athlete.firstName} {r.athlete.lastName}</div><div className="text-xs" style={{color:"var(--slate)"}}>{r.latest.race.raceName} · {dateLabel(r.latest.race.date)}</div></button><div className="flex items-center gap-5 shrink-0"><div className="text-right"><div className="nrr-num font-semibold">{placeLabel(index+1)}</div><div className="text-xs" style={{color:"var(--slate)"}}>Roster place</div></div><div className="nrr-num text-sm" style={{color:"var(--slate)"}}>{r.latest.result.totalTime || displayTime(r.latest.result.totalTimeSec)}</div></div></div>)}</div>}</Card>)}</div>;
}

function AthleteDetail({ athleteId, teamAthletes, goto }) {
  const athlete = teamAthletes.find(a => a.id === athleteId);
  const [seasonFilter, setSeasonFilter] = useState("ALL");
  if (!athlete) return <div className="text-sm" style={{color:"var(--slate)"}}>Athlete not found.</div>;

  const seasons = [...new Set((athlete.results || []).map(x => raceSeason(x.race)).filter(Boolean))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));
  const currentSeason = seasons[0] || "";
  const activeSeason = seasonFilter === "ALL" ? "ALL" : (seasons.includes(seasonFilter) ? seasonFilter : currentSeason);
  const rows = [...athlete.results].filter(x => activeSeason === "ALL" || raceSeason(x.race) === activeSeason).sort((a,b)=>String(b.race.date||"").localeCompare(String(a.race.date||"")));
  const best5k = rows.filter(x=>distanceForClass(rosterClassKey(x.result,x.race.raceName),x.result,x.race)===5 && Number.isFinite(Number(x.result.totalTimeSec))).sort((a,b)=>Number(a.result.totalTimeSec)-Number(b.result.totalTimeSec))[0] || null;
  const best2_5k = rows.filter(x=>distanceForClass(rosterClassKey(x.result,x.race.raceName),x.result,x.race)===2.5 && Number.isFinite(Number(x.result.totalTimeSec))).sort((a,b)=>Number(a.result.totalTimeSec)-Number(b.result.totalTimeSec))[0] || null;
  const positions = rows.map(x=>place(x.result)).filter(Number.isFinite);
  const chartData = [...rows].reverse().filter(x=>Number.isFinite(place(x.result))).map((x,i)=>{
    const level = rosterClassKey(x.result,x.race.raceName);
    return { i:i+1, name:x.race.raceName, date:x.race.date, place:place(x.result), placeConnector:place(x.result), varsityPlace: level === "GVAR" || level === "BVAR" ? place(x.result) : null, jvPlace: level === "GJV" || level === "BJV" ? place(x.result) : null };
  });
  return <div className="flex flex-col gap-5">
    <button onClick={()=>goto("athletes")} className="nrr-focus text-xs flex items-center gap-1" style={{color:"var(--slate)"}}><ChevronLeft size={14}/> Team roster</button>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Athlete</div><h1 className="nrr-display text-3xl sm:text-4xl">{athlete.firstName} {athlete.lastName}</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>{athlete.team || athlete.school || TEAM_NAME}</p></div><div><label className="block text-xs font-medium mb-1" style={{color:"var(--slate)"}}>Season</label><select value={activeSeason} onChange={e=>setSeasonFilter(e.target.value)} className="nrr-focus rounded-lg border px-3 py-2 text-sm bg-white" style={{borderColor:"var(--border)",color:"var(--ink)"}}><option value="ALL">Every Season</option>{seasons.map((s,i)=><option key={s} value={s}>{i===0?`Current Season (${s})`:s}</option>)}</select></div></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><StatCard label="Races" value={rows.length}/><StatCard label="Best 5K" value={best5k ? (best5k.result.totalTime || displayTime(best5k.result.totalTimeSec)) : "—"}/><StatCard label="Best 2.5K" value={best2_5k ? (best2_5k.result.totalTime || displayTime(best2_5k.result.totalTimeSec)) : "—"}/><StatCard label="Best place" value={positions.length?placeLabel(Math.min(...positions)):"—"}/></div>
    <Card className="p-5 sm:p-6"><div className="flex items-center justify-between mb-3"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Performance</div><h2 className="nrr-display text-2xl">Finish Position Over Time</h2></div><span className="text-xs" style={{color:"var(--slate)"}}>Lower is better</span></div>{chartData.length>1?<><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{left:-20,right:10}}><CartesianGrid stroke="var(--border-soft)" vertical={false}/><XAxis dataKey="i" tick={{fontSize:11,fill:"#7A8699"}} axisLine={false} tickLine={false}/><YAxis reversed tick={{fontSize:11,fill:"#7A8699"}} axisLine={false} tickLine={false} width={30} allowDecimals={false}/><Tooltip labelFormatter={()=>""} formatter={(v,n,p)=>[placeLabel(v),`${n === "varsityPlace" ? "Varsity" : n === "jvPlace" ? "JV" : "Place"} · ${p.payload.name}`]} contentStyle={{fontSize:12,borderRadius:10,border:"1px solid var(--border)"}}/><Line type="monotone" dataKey="placeConnector" name="connector" stroke="var(--slate)" strokeWidth={2.5} dot={false} activeDot={false} connectNulls/><Line type="monotone" dataKey="varsityPlace" name="varsityPlace" stroke="var(--ice)" strokeWidth={2.5} dot={{r:4,fill:"var(--ice)"}} activeDot={{r:5}} connectNulls={false}/><Line type="monotone" dataKey="jvPlace" name="jvPlace" stroke="var(--gold)" strokeWidth={2.5} dot={{r:4,fill:"var(--gold)"}} activeDot={{r:5}} connectNulls={false}/></LineChart></ResponsiveContainer></div><div className="flex items-center justify-center gap-5 mt-2 text-xs" style={{color:"var(--slate)"}}><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{background:"var(--ice)"}}/> Varsity</span><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{background:"var(--gold)"}}/> JV</span></div></>:<div className="text-sm" style={{color:"var(--slate)"}}>Not enough placed results for a performance chart.</div>}</Card>
    <Card className="overflow-hidden"><div className="px-5 py-4 font-semibold">Race history</div>{rows.map(({race,result},i)=><button key={`${race.id}-${i}`} onClick={()=>goto("race",race.id)} className="nrr-focus w-full flex items-center justify-between gap-4 px-5 py-3 border-t text-left" style={{borderColor:"var(--border-soft)"}}><span className="min-w-0"><span className="block font-medium truncate">{race.raceName}</span><span className="block text-xs mt-0.5" style={{color:"var(--slate)"}}>{dateLabel(race.date)}</span></span><span className="shrink-0 text-right"><span className="block font-semibold">{result.totalTime || displayTime(result.totalTimeSec)}</span><span className="block text-xs" style={{color:"var(--slate)"}}>{placeLabel(place(result))}</span></span></button>)}</Card>
  </div>;
}

function RacesPage({ races, teamAthletes, goto }) {
  const [query,setQuery]=useState("");
  const rows=[...races].filter(r=>normalize(r.raceName).includes(normalize(query))).filter(r=>teamRaceResults(r,teamAthletes).length).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  const seasons=[...new Set(rows.map(r=>raceSeason(r)))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));
  const grouped=seasons.map(season=>({season,rows:rows.filter(r=>raceSeason(r)===season)})).filter(g=>g.rows.length);
  return <div className="flex flex-col gap-5"><div className="flex items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Races</div><h1 className="nrr-display text-3xl sm:text-4xl">Race History</h1></div></div><Card className="p-4"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:"var(--slate)"}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search races" className="nrr-focus w-full rounded-lg px-9 py-2.5 text-sm border" style={{borderColor:"var(--border)"}}/></div></Card>{grouped.map(group=><section key={group.season}><div className="flex items-center gap-3 mb-3"><h2 className="nrr-display text-2xl">{group.season}</h2><span className="text-xs" style={{color:"var(--slate)"}}>{group.rows.length} races</span></div><div className="grid md:grid-cols-2 gap-4">{group.rows.map(r=><button key={r.id} onClick={()=>goto("race",r.id)} className="nrr-focus text-left"><Card className="p-5 h-full"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs" style={{color:"var(--slate)"}}>{dateLabel(r.date)}</div><h2 className="font-semibold mt-1 truncate">{r.raceName}</h2><div className="text-xs mt-1 truncate" style={{color:"var(--slate)"}}>{r.location || "Location not listed"}</div></div><ChevronRight size={16} style={{color:"var(--slate)"}}/></div><div className="mt-4 text-xs" style={{color:"var(--ice)"}}>{teamRaceResults(r,teamAthletes).length} team results</div></Card></button>)}</div></section>)}{grouped.length===0&&<div className="text-sm" style={{color:"var(--slate)"}}>No races found.</div>}</div>;
}

function RaceDetail({ race, teamAthletes, goto }) {
  if(!race) return <div className="text-sm" style={{color:"var(--slate)"}}>Race not found.</div>;
  const rawRows = dedupeRaceResults(teamRaceResults(race,teamAthletes));
  const groups = CLASS_ORDER.map(classKey => ({
    classKey,
    rows: rawRows.filter(r => rosterClassKey(r, race.raceName) === classKey).sort((a,b)=>{
      const ta=Number(a.totalTimeSec), tb=Number(b.totalTimeSec), va=Number.isFinite(ta), vb=Number.isFinite(tb);
      if(va&&vb&&ta!==tb) return ta-tb;
      if(va!==vb) return va?-1:1;
      return `${a.lastName||""} ${a.firstName||""}`.localeCompare(`${b.lastName||""} ${b.firstName||""}`);
    })
  }));
  return <div className="flex flex-col gap-5"><button onClick={()=>goto("races")} className="nrr-focus text-xs flex items-center gap-1" style={{color:"var(--slate)"}}><ChevronLeft size={14}/> Race history</button><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Race</div><h1 className="nrr-display text-3xl sm:text-4xl">{race.raceName}</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>{dateLabel(race.date)} · {race.location || "Location not listed"}</p></div>{groups.map(({classKey,rows})=><Card key={classKey} className="overflow-hidden"><div className="px-5 py-4 flex items-center justify-between"><div className="font-semibold">{CLASS_LABELS[classKey]}</div><div className="text-xs" style={{color:"var(--slate)"}}>{rows.length} athlete{rows.length===1?"":"s"}</div></div>{rows.length===0?<div className="px-5 pb-5 text-sm" style={{color:"var(--slate)"}}>No results in this group.</div>:<><div className="grid grid-cols-[2fr_1fr_1fr] px-5 py-3 text-xs uppercase tracking-wide font-semibold" style={{color:"var(--slate)",background:"rgba(234,243,250,.55)"}}><span>Athlete</span><span>Place</span><span>Time</span></div>{rows.map((r,i)=><button key={`${resultPersonKey(r)}-${i}`} onClick={()=>{const a=teamAthletes.find(x=>normalizeIdentity(`${x.firstName} ${x.lastName}`)===resultPersonKey(r)); if(a) goto("athlete",a.id);}} className="nrr-focus w-full grid grid-cols-[2fr_1fr_1fr] px-5 py-3 border-t text-left items-center text-sm" style={{borderColor:"var(--border-soft)"}}><span className="font-medium truncate">{r.firstName} {r.lastName}</span><span>{placeLabel(place(r))}</span><span className="nrr-num font-semibold">{r.totalTime || displayTime(r.totalTimeSec)}</span></button>)}</>}</Card>)}</div>;
}

function AverageClassGraph({ classKey, races, teamAthletes, seasonFilter }) {
  const data = [...seasonFilteredRaces(races,teamAthletes,seasonFilter)].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).map(race=>{
    const results=dedupeRaceResults(teamRaceResults(race,teamAthletes)).filter(r=>rosterClassKey(r,race.raceName)===classKey && Number.isFinite(Number(r.totalTimeSec)));
    if(!results.length) return null;
    return { raceName: race.raceName, date: race.date, seconds: results.reduce((sum,r)=>sum+Number(r.totalTimeSec),0)/results.length };
  }).filter(Boolean);
  return <Card className="p-5"><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>{CLASS_LABELS[classKey]}</div><h3 className="nrr-display text-xl mt-1">Average team time</h3>{data.length>1?<div className="h-64 mt-3"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{left:-15,right:10}}><CartesianGrid stroke="var(--border-soft)" vertical={false}/><XAxis dataKey="date" tickFormatter={v=>dateLabel(v).replace(/, \d{4}/,"")} tick={{fontSize:10,fill:"#7A8699"}} axisLine={false} tickLine={false}/><YAxis reversed tickFormatter={v=>displayTime(v)} tick={{fontSize:11,fill:"#7A8699"}} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(_,payload)=>payload?.[0]?.payload?.raceName || ""} formatter={v=>displayTime(v)} contentStyle={{fontSize:12,borderRadius:10,border:"1px solid var(--border)"}}/><Line type="monotone" dataKey="seconds" stroke="var(--ice)" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer></div>:<div className="text-sm mt-4" style={{color:"var(--slate)"}}>{data.length===1?"Only one published race in this group.":"No published results in this group."}</div>}</Card>;
}

function AnalyticsPage({ races, teamAthletes }) {
  const seasons = seasonOptionsFor(races, teamAthletes);
  const [seasonFilter,setSeasonFilter] = useState("ALL");
  const activeSeason = seasonFilter === "ALL" || seasons.includes(seasonFilter) ? seasonFilter : "ALL";
  const fastest = CLASS_ORDER.map(classKey => {
    const rows = teamAthletes.map(a => {
      const assignment = classifyLatestForAthlete(a, activeSeason);
      if (assignment.classKey !== classKey) return null;
      const eligible=assignment.rows.filter(x=>rosterClassKey(x.result,x.race.raceName)===classKey && Number.isFinite(Number(x.result.totalTimeSec))).sort((x,y)=>Number(x.result.totalTimeSec)-Number(y.result.totalTimeSec));
      return eligible[0] ? { athlete:a, best:eligible[0], count:eligible.length } : null;
    }).filter(Boolean).sort((a,b)=>Number(a.best.result.totalTimeSec)-Number(b.best.result.totalTimeSec));
    return { classKey, rows };
  });
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Analytics</div><h1 className="nrr-display text-3xl sm:text-4xl">Team Performance</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>Descriptive statistics from published race results. No team scoring is assumed.</p></div><div><label className="block text-xs font-medium mb-1" style={{color:"var(--slate)"}}>Season</label><select value={activeSeason} onChange={e=>setSeasonFilter(e.target.value)} className="nrr-focus rounded-lg border px-3 py-2 text-sm bg-white" style={{borderColor:"var(--border)",color:"var(--ink)"}}><option value="ALL">Every Season</option>{seasons.map((s,i)=><option key={s} value={s}>{i===0?`Current Season (${s})`:s}</option>)}</select></div></div><div className="grid xl:grid-cols-2 gap-5">{CLASS_ORDER.map(k=><AverageClassGraph key={k} classKey={k} races={races} teamAthletes={teamAthletes} seasonFilter={activeSeason}/>)}</div><div className="grid xl:grid-cols-2 gap-5">{fastest.map(({classKey,rows})=><Card key={classKey} className="overflow-hidden"><div className="px-5 py-4"><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>{CLASS_LABELS[classKey]}</div><div className="font-semibold mt-1">Fastest available results by athlete</div></div><div className="grid grid-cols-[1.6fr_.8fr_.9fr] px-5 py-3 text-xs uppercase tracking-wide font-semibold" style={{color:"var(--slate)",background:"rgba(234,243,250,.55)"}}><span>Athlete</span><span>Races</span><span>Best</span></div>{rows.map(x=><div key={`${classKey}-${x.athlete.id}`} className="grid grid-cols-[1.6fr_.8fr_.9fr] px-5 py-3 border-t text-sm" style={{borderColor:"var(--border-soft)"}}><span className="font-medium">{x.athlete.firstName} {x.athlete.lastName}</span><span>{x.count}</span><span className="nrr-num font-semibold">{x.best.result.totalTime || displayTime(x.best.result.totalTimeSec)}</span></div>)}{rows.length===0&&<div className="p-5 text-sm" style={{color:"var(--slate)"}}>No results in this group.</div>}</Card>)}</div></div>;
}

function SeasonPage({ races, teamAthletes }) {
  const seasons=[...new Set(races.filter(r=>teamRaceResults(r,teamAthletes).length).map(r=>raceSeason(r)))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));
  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Season</div><h1 className="nrr-display text-3xl sm:text-4xl">Season Overview</h1></div><div className="grid md:grid-cols-2 gap-4">{seasons.map(s=>{const rs=races.filter(r=>raceSeason(r)===s&&teamRaceResults(r,teamAthletes).length);const best=rs.flatMap(r=>teamRaceResults(r,teamAthletes)).map(x=>Number(x.totalTimeSec)).filter(Number.isFinite);return <Card key={s} className="p-5"><div className="text-xs" style={{color:"var(--slate)"}}>Season</div><h2 className="nrr-display text-2xl">{s}</h2><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><div className="text-xs" style={{color:"var(--slate)"}}>Races</div><strong>{rs.length}</strong></div><div><div className="text-xs" style={{color:"var(--slate)"}}>Athletes</div><strong>{new Set(rs.flatMap(r=>teamRaceResults(r,teamAthletes).map(x=>resultPersonKey(x)))).size}</strong></div><div><div className="text-xs" style={{color:"var(--slate)"}}>Fastest</div><strong className="nrr-num">{best.length?displayTime(Math.min(...best)):"—"}</strong></div></div></Card>})}</div></div>;
}

function CoachSettings({ onLogout }) {
  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Settings</div><h1 className="nrr-display text-3xl sm:text-4xl">Coach Settings</h1></div><Card className="p-5 sm:p-6"><div className="font-semibold">Coach account</div><div className="text-sm mt-1" style={{color:"var(--slate)"}}>Signed in as Mahtcoach. This Coach Mode uses the same published race data as the athlete app.</div><Button className="mt-5" variant="outline" icon={LogOut} onClick={onLogout}>Log out</Button></Card></div>;
}

export default function CoachApp({ combined, onLogout }) {
  const [page,setPage]=useState("dashboard");
  const [selectedRaceId,setSelectedRaceId]=useState(null);
  const [selectedAthleteId,setSelectedAthleteId]=useState(null);
  const [navOpen,setNavOpen]=useState(false);
  const races=combined?.races || [];
  const athletes=combined?.athletes || [];
  const teamAthletes=useMemo(()=>buildTeamAthletes(athletes,races),[athletes,races]);
  const goto=(p,extra)=>{if(p==="race"){setSelectedRaceId(extra);setPage("race");}else if(p==="athlete"){setSelectedAthleteId(extra);setPage("athlete");}else setPage(p);setNavOpen(false);window.scrollTo({top:0});};
  const race=selectedRaceId?races.find(r=>r.id===selectedRaceId):null;
  const NAV=[{key:"dashboard",label:"Dashboard",icon:Snowflake},{key:"athletes",label:"Athletes",icon:Users},{key:"races",label:"Races",icon:Flag},{key:"analytics",label:"Analytics",icon:TrendingUp},{key:"season",label:"Season",icon:Calendar},{key:"settings",label:"Settings",icon:SettingsIcon}];
  return <div className="nrr-root min-h-screen flex"><aside className={`fixed sm:static z-[100000] inset-y-0 left-0 w-72 border-r flex flex-col transition-transform sm:translate-x-0 ${navOpen?"translate-x-0":"-translate-x-full"}`} style={{borderColor:"#314A67",color:"#F4F8FC",backgroundColor:"#243B55"}}><div className="nrr-classic-lines" aria-hidden="true"/><div className="p-5 flex items-center gap-3 relative z-10"><div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:"rgba(255,255,255,.10)"}}><Snowflake size={27}/></div><span className="nrr-display text-base leading-tight">My Nordic<br/>Race Results</span></div><div className="px-5 pb-4 relative z-10"><span className="text-xs uppercase tracking-wider" style={{color:"#A9D8F4"}}>Coach Mode</span><div className="font-semibold mt-0.5">{TEAM_NAME} Nordic</div></div><nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto nrr-scrollbar">{NAV.map(item=>{const active=page===item.key;return <button key={item.key} onClick={()=>goto(item.key)} className="nrr-focus relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-lg text-sm text-left transition-colors" style={{background:active?"rgba(112,168,210,.20)":"transparent",color:active?"#DDF1FF":"#D4E0EC",fontWeight:active?600:500}}>{active&&<span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{background:"var(--ice)"}}/>}<item.icon size={16} strokeWidth={active?2.3:2}/>{item.label}</button>})}</nav><div className="p-4 border-t text-sm" style={{borderColor:"var(--border)"}}><div className="font-medium">Mahtcoach</div><div className="text-xs mb-3" style={{color:"#B8C9DA"}}>{TEAM_NAME} Nordic · Coach</div><button onClick={onLogout} className="nrr-focus flex items-center gap-1.5 text-xs" style={{color:"#B8C9DA"}}><LogOut size={13}/> Log out</button></div></aside>{navOpen&&<div className="nrr-mobile-menu-overlay fixed inset-0 bg-black/30 z-[99999] sm:hidden" onClick={()=>setNavOpen(false)}/>}<main className="flex-1 min-w-0 pb-20 sm:pb-0"><div className="sm:hidden flex items-center justify-between p-5 border-b bg-white sticky top-0 z-[80]" style={{borderColor:"var(--border)"}}><button onClick={()=>setNavOpen(true)} className="nrr-focus p-1 -m-1"><Menu size={24}/></button><span className="nrr-display text-base">Coach Mode</span><button onClick={onLogout} className="nrr-focus p-1 -m-1"><LogOut size={18}/></button></div><div className="max-w-[96rem] mx-auto p-5 sm:p-10 lg:p-12">{page==="dashboard"&&<CoachDashboard races={races} teamAthletes={teamAthletes} goto={goto}/>} {page==="athletes"&&<AthletesPage teamAthletes={teamAthletes} goto={goto}/>} {page==="athlete"&&<AthleteDetail athleteId={selectedAthleteId} teamAthletes={teamAthletes} goto={goto}/>} {page==="races"&&<RacesPage races={races} teamAthletes={teamAthletes} goto={goto}/>} {page==="race"&&<RaceDetail race={race} teamAthletes={teamAthletes} goto={goto}/>} {page==="analytics"&&<AnalyticsPage races={races} teamAthletes={teamAthletes}/>} {page==="season"&&<SeasonPage races={races} teamAthletes={teamAthletes}/>} {page==="settings"&&<CoachSettings onLogout={onLogout}/>}</div></main><nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t flex items-stretch" style={{borderColor:"var(--border)",paddingBottom:"env(safe-area-inset-bottom)"}}>{NAV.slice(0,4).map(item=>{const active=page===item.key;return <button key={item.key} onClick={()=>goto(item.key)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:active?"var(--ice)":"var(--slate)"}}><item.icon size={19} strokeWidth={active?2.4:1.9}/><span className="text-[10px]">{item.label}</span></button>})}<button onClick={()=>setNavOpen(true)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:"var(--slate)"}}><Menu size={19}/><span className="text-[10px]">More</span></button></nav></div>;
}
