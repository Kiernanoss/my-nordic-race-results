import React, { useMemo, useState } from "react";
import {
  Snowflake, Users, Flag, TrendingUp, Calendar, Settings as SettingsIcon,
  LogOut, Search, ChevronRight, ChevronLeft, Menu, X, Award, BarChart3,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const TEAM_NAME = "Mahtomedi";

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
const teamMatch = (value) => normalize(value).includes(normalize(TEAM_NAME));

function CoachDashboard({ races, athletes, goto }) {
  const teamAthletes = athletes.filter((a) => teamMatch(a.team) || teamMatch(a.school));
  const teamIds = new Set(teamAthletes.map((a) => a.id));
  const teamRows = races.flatMap((race) => (race.results || []).filter((r) => teamIds.has(r.athleteId) || teamMatch(r.team) || teamMatch(r.school)).map((result) => ({ race, result })));
  const recent = [...races].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  const recentRows = recent ? recent.results.filter((r) => teamIds.has(r.athleteId) || teamMatch(r.team) || teamMatch(r.school)).sort((a, b) => place(a) - place(b)).slice(0, 8) : [];
  const timed = teamRows.map(({ result }) => Number(result.totalTimeSec)).filter(Number.isFinite);
  const avg = timed.length ? displayTime(timed.reduce((a, b) => a + b, 0) / timed.length) : "—";
  const seasonBest = timed.length ? displayTime(Math.min(...timed)) : "—";
  const raceCount = new Set(teamRows.map(({ race }) => race.id)).size;

  return <div className="flex flex-col gap-6">
    <div><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Coach Dashboard</div><h1 className="nrr-display text-3xl sm:text-4xl">{TEAM_NAME} Nordic</h1><p className="text-sm mt-1" style={{ color: "var(--slate)" }}>Team results and season information from the races already published in My Nordic Race Results.</p></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Athletes" value={teamAthletes.length} icon={Users} />
      <StatCard label="Races" value={raceCount} icon={Flag} />
      <StatCard label="Average time" value={avg} icon={TrendingUp} sub="All available team results" />
      <StatCard label="Fastest result" value={seasonBest} icon={Award} />
    </div>
    <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-5">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Latest published race</div><h2 className="nrr-display text-2xl">{recent?.raceName || "No races yet"}</h2></div>{recent && <Button size="sm" variant="outline" onClick={() => goto("race", recent.id)} icon={ChevronRight}>View</Button>}</div>
        {recent && <><div className="text-xs mb-4" style={{ color: "var(--slate)" }}>{dateLabel(recent.date)} · {recent.location || "Location not listed"}</div><div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>{recentRows.map((r, i) => <div key={`${r.athleteId}-${i}`} className="flex items-center justify-between py-2.5 text-sm"><span className="font-medium truncate pr-3">{r.firstName} {r.lastName}</span><span className="flex items-center gap-4 shrink-0"><span className="text-xs" style={{ color: "var(--slate)" }}>{placeLabel(place(r))}</span><span className="nrr-num font-semibold">{r.totalTime || displayTime(r.totalTimeSec)}</span></span></div>)}{recentRows.length === 0 && <div className="py-4 text-sm" style={{ color: "var(--slate)" }}>No team results found for this race.</div>}</div></>}
      </Card>
      <Card className="p-5 sm:p-6"><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Quick access</div><div className="flex flex-col gap-2 mt-3"><Button variant="outline" className="justify-between" onClick={() => goto("athletes")}>Team roster <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("races")}>Race history <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("analytics")}>Team analytics <ChevronRight size={14}/></Button><Button variant="outline" className="justify-between" onClick={() => goto("season")}>Season overview <ChevronRight size={14}/></Button></div></Card>
    </div>
  </div>;
}

function AthletesPage({ athletes, races, goto }) {
  const [query, setQuery] = useState("");
  const teamAthletes = athletes.filter((a) => teamMatch(a.team) || teamMatch(a.school));
  const rows = teamAthletes.map((athlete) => {
    const results = races.flatMap((race) => (race.results || []).filter((r) => r.athleteId === athlete.id).map((result) => ({ race, result })));
    const timed = results.map((x) => Number(x.result.totalTimeSec)).filter(Number.isFinite);
    const best = timed.length ? Math.min(...timed) : null;
    const latest = [...results].sort((a,b) => String(b.race.date || "").localeCompare(String(a.race.date || "")))[0];
    const positions = results.map(x => place(x.result)).filter(Number.isFinite);
    return { athlete, results, best, latest, avgPlace: positions.length ? positions.reduce((a,b)=>a+b,0)/positions.length : null };
  }).filter(({ athlete }) => normalize(`${athlete.firstName} ${athlete.lastName}`).includes(normalize(query)))
    .sort((a,b) => (a.best ?? Infinity) - (b.best ?? Infinity));

  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--ice)" }}>Athletes</div><h1 className="nrr-display text-3xl sm:text-4xl">Team Roster</h1></div><Card className="p-4"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--slate)" }}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search athletes" className="nrr-focus w-full rounded-lg px-9 py-2.5 text-sm border" style={{ borderColor: "var(--border)" }}/></div></Card><Card className="overflow-hidden"><div className="hidden sm:grid grid-cols-[1.5fr_.7fr_.7fr_.8fr] gap-4 px-5 py-3 text-xs uppercase tracking-wide font-semibold" style={{ color: "var(--slate)", background: "rgba(234,243,250,.55)" }}><span>Athlete</span><span>Races</span><span>Season best</span><span>Avg. place</span></div>{rows.map(({athlete,results,best,avgPlace})=><button key={athlete.id} onClick={()=>goto("athlete",athlete.id)} className="nrr-focus w-full text-left grid sm:grid-cols-[1.5fr_.7fr_.7fr_.8fr] gap-2 sm:gap-4 px-5 py-3.5 border-t items-center" style={{ borderColor: "var(--border-soft)" }}><span className="font-medium">{athlete.firstName} {athlete.lastName}<span className="block sm:hidden text-xs mt-0.5" style={{color:"var(--slate)"}}>{results.length} races · best {best == null ? "—" : displayTime(best)}</span></span><span className="hidden sm:block text-sm">{results.length}</span><span className="hidden sm:block nrr-num text-sm">{best == null ? "—" : displayTime(best)}</span><span className="hidden sm:block text-sm">{avgPlace == null ? "—" : avgPlace.toFixed(1)}</span></button>)}{rows.length===0&&<div className="p-6 text-sm" style={{color:"var(--slate)"}}>No athletes found.</div>}</Card></div>;
}

function AthleteDetail({ athleteId, athletes, races, goto }) {
  const athlete = athletes.find(a=>a.id===athleteId);
  const rows = races.flatMap(race => (race.results||[]).filter(r=>r.athleteId===athleteId).map(result=>({race,result}))).sort((a,b)=>String(b.race.date||"").localeCompare(String(a.race.date||"")));
  const timed=rows.map(x=>Number(x.result.totalTimeSec)).filter(Number.isFinite);
  const best=timed.length?Math.min(...timed):null;
  const chart=[...rows].reverse().filter(x=>Number.isFinite(Number(x.result.totalTimeSec))).map(x=>({name:dateLabel(x.race.date).replace(/, \d{4}/,""),seconds:Number(x.result.totalTimeSec),label:x.race.raceName}));
  if(!athlete) return <div className="text-sm" style={{color:"var(--slate)"}}>Athlete not found.</div>;
  return <div className="flex flex-col gap-5"><button onClick={()=>goto("athletes")} className="nrr-focus text-xs flex items-center gap-1" style={{color:"var(--slate)"}}><ChevronLeft size={14}/> Team roster</button><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Athlete</div><h1 className="nrr-display text-3xl sm:text-4xl">{athlete.firstName} {athlete.lastName}</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>{athlete.team || athlete.school || TEAM_NAME}</p></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><StatCard label="Races" value={rows.length}/><StatCard label="Season best" value={best==null?"—":displayTime(best)}/><StatCard label="Best place" value={rows.length?Math.min(...rows.map(x=>place(x.result)).filter(Number.isFinite))||"—":"—"}/><StatCard label="Average place" value={(()=>{const p=rows.map(x=>place(x.result)).filter(Number.isFinite); return p.length?(p.reduce((a,b)=>a+b,0)/p.length).toFixed(1):"—";})()}/></div><Card className="p-5 sm:p-6"><div className="mb-3"><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Progress</div><h2 className="nrr-display text-2xl">Race times</h2></div>{chart.length>1?<div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#DCE7EF"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis reversed tickFormatter={v=>displayTime(v)} tick={{fontSize:11}}/><Tooltip formatter={(v)=>displayTime(v)} labelFormatter={(v)=>v}/><Line type="monotone" dataKey="seconds" stroke="var(--ice)" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer></div>:<div className="text-sm" style={{color:"var(--slate)"}}>Not enough timed results for a progress chart.</div>}</Card><Card className="overflow-hidden"><div className="px-5 py-4 font-semibold">Race history</div>{rows.map(({race,result},i)=><button key={`${race.id}-${i}`} onClick={()=>goto("race",race.id)} className="nrr-focus w-full flex items-center justify-between gap-4 px-5 py-3 border-t text-left" style={{borderColor:"var(--border-soft)"}}><span className="min-w-0"><span className="block font-medium truncate">{race.raceName}</span><span className="block text-xs mt-0.5" style={{color:"var(--slate)"}}>{dateLabel(race.date)}</span></span><span className="shrink-0 text-right"><span className="block font-semibold">{result.totalTime || displayTime(result.totalTimeSec)}</span><span className="block text-xs" style={{color:"var(--slate)"}}>{placeLabel(place(result))}</span></span></button>)}{rows.length===0&&<div className="p-5 text-sm" style={{color:"var(--slate)"}}>No results found.</div>}</Card></div>;
}

function RacesPage({ races, athletes, goto }) {
  const [query,setQuery]=useState("");
  const teamIds=new Set(athletes.filter(a=>teamMatch(a.team)||teamMatch(a.school)).map(a=>a.id));
  const rows=[...races].filter(r=>normalize(r.raceName).includes(normalize(query))).filter(r=>(r.results||[]).some(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school))).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Races</div><h1 className="nrr-display text-3xl sm:text-4xl">Race History</h1></div><Card className="p-4"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:"var(--slate)"}}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search races" className="nrr-focus w-full rounded-lg px-9 py-2.5 text-sm border" style={{borderColor:"var(--border)"}}/></div></Card><div className="grid md:grid-cols-2 gap-4">{rows.map(r=><button key={r.id} onClick={()=>goto("race",r.id)} className="nrr-focus text-left"><Card className="p-5 h-full"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs" style={{color:"var(--slate)"}}>{dateLabel(r.date)}</div><h2 className="font-semibold mt-1 truncate">{r.raceName}</h2><div className="text-xs mt-1 truncate" style={{color:"var(--slate)"}}>{r.location || "Location not listed"}</div></div><ChevronRight size={16} style={{color:"var(--slate)"}}/></div><div className="mt-4 text-xs" style={{color:"var(--ice)"}}>{(r.results||[]).filter(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school)).length} team results</div></Card></button>)}{rows.length===0&&<div className="text-sm" style={{color:"var(--slate)"}}>No races found.</div>}</div></div>;
}

function RaceDetail({ race, athletes, goto }) {
  if(!race) return <div className="text-sm" style={{color:"var(--slate)"}}>Race not found.</div>;
  const teamIds=new Set(athletes.filter(a=>teamMatch(a.team)||teamMatch(a.school)).map(a=>a.id));
  const rows=(race.results||[]).filter(r=>teamIds.has(r.athleteId)||teamMatch(r.team)||teamMatch(r.school)).sort((a,b)=>place(a)-place(b));
  return <div className="flex flex-col gap-5"><button onClick={()=>goto("races")} className="nrr-focus text-xs flex items-center gap-1" style={{color:"var(--slate)"}}><ChevronLeft size={14}/> Race history</button><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Race</div><h1 className="nrr-display text-3xl sm:text-4xl">{race.raceName}</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>{dateLabel(race.date)} · {race.location || "Location not listed"}</p></div><Card className="overflow-hidden"><div className="grid grid-cols-[2fr_1fr_1fr] px-5 py-3 text-xs uppercase tracking-wide font-semibold" style={{color:"var(--slate)",background:"rgba(234,243,250,.55)"}}><span>Athlete</span><span>Place</span><span>Time</span></div>{rows.map((r,i)=><button key={`${r.athleteId}-${i}`} onClick={()=>goto("athlete",r.athleteId)} className="nrr-focus w-full grid grid-cols-[2fr_1fr_1fr] px-5 py-3 border-t text-left items-center text-sm" style={{borderColor:"var(--border-soft)"}}><span className="font-medium truncate">{r.firstName} {r.lastName}</span><span>{placeLabel(place(r))}</span><span className="nrr-num font-semibold">{r.totalTime || displayTime(r.totalTimeSec)}</span></button>)}{rows.length===0&&<div className="p-5 text-sm" style={{color:"var(--slate)"}}>No team results found.</div>}</Card></div>;
}

function AnalyticsPage({ races, athletes }) {
  const teamIds=new Set(athletes.filter(a=>teamMatch(a.team)||teamMatch(a.school)).map(a=>a.id));
  const data=[...races].sort((a,b)=>String(a.date||"").localeCompare(String(b.date||""))).map(r=>{const t=(r.results||[]).filter(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school)).map(x=>Number(x.totalTimeSec)).filter(Number.isFinite);return t.length?{name:dateLabel(r.date).replace(/, \d{4}/,""),seconds:t.reduce((a,b)=>a+b,0)/t.length}:null;}).filter(Boolean);
  const rows=athletes.filter(a=>teamIds.has(a.id)).map(a=>{const rs=races.flatMap(r=>(r.results||[]).filter(x=>x.athleteId===a.id));const t=rs.map(x=>Number(x.totalTimeSec)).filter(Number.isFinite);return {a,best:t.length?Math.min(...t):null,count:rs.length};}).sort((x,y)=>(x.best??Infinity)-(y.best??Infinity));
  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Analytics</div><h1 className="nrr-display text-3xl sm:text-4xl">Team Performance</h1><p className="text-sm mt-1" style={{color:"var(--slate)"}}>Descriptive statistics from published race results. No team scoring is assumed.</p></div><Card className="p-5 sm:p-6"><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Average team time</div><h2 className="nrr-display text-2xl">Across published races</h2>{data.length>1?<div className="h-72 mt-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#DCE7EF"/><XAxis dataKey="name" tick={{fontSize:11}}/><YAxis reversed tickFormatter={v=>displayTime(v)} tick={{fontSize:11}}/><Tooltip formatter={v=>displayTime(v)}/><Line type="monotone" dataKey="seconds" stroke="var(--ice)" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer></div>:<div className="text-sm mt-4" style={{color:"var(--slate)"}}>Not enough published races for a trend chart.</div>}</Card><Card className="overflow-hidden"><div className="px-5 py-4 font-semibold">Fastest available results by athlete</div>{rows.map(x=><div key={x.a.id} className="grid grid-cols-[1.6fr_.8fr_.8fr] px-5 py-3 border-t text-sm" style={{borderColor:"var(--border-soft)"}}><span className="font-medium">{x.a.firstName} {x.a.lastName}</span><span>{x.count} races</span><span className="nrr-num font-semibold">{x.best==null?"—":displayTime(x.best)}</span></div>)}</Card></div>;
}

function SeasonPage({ races, athletes }) {
  const teamIds=new Set(athletes.filter(a=>teamMatch(a.team)||teamMatch(a.school)).map(a=>a.id));
  const seasons=[...new Set(races.map(r=>r.season).filter(Boolean))].sort().reverse();
  return <div className="flex flex-col gap-5"><div><div className="text-xs uppercase tracking-wider font-semibold" style={{color:"var(--ice)"}}>Season</div><h1 className="nrr-display text-3xl sm:text-4xl">Season Overview</h1></div><div className="grid md:grid-cols-2 gap-4">{seasons.map(s=>{const rs=races.filter(r=>r.season===s&&((r.results||[]).some(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school))));const best=rs.flatMap(r=>r.results||[]).filter(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school)).map(x=>Number(x.totalTimeSec)).filter(Number.isFinite);return <Card key={s} className="p-5"><div className="text-xs" style={{color:"var(--slate)"}}>Season</div><h2 className="nrr-display text-2xl">{s}</h2><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><div className="text-xs" style={{color:"var(--slate)"}}>Races</div><strong>{rs.length}</strong></div><div><div className="text-xs" style={{color:"var(--slate)"}}>Athletes</div><strong>{new Set(rs.flatMap(r=>(r.results||[]).filter(x=>teamIds.has(x.athleteId)||teamMatch(x.team)||teamMatch(x.school)).map(x=>x.athleteId))).size}</strong></div><div><div className="text-xs" style={{color:"var(--slate)"}}>Fastest</div><strong className="nrr-num">{best.length?displayTime(Math.min(...best)):"—"}</strong></div></div></Card>})}</div></div>;
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
  const goto=(p,extra)=>{if(p==="race"){setSelectedRaceId(extra);setPage("race");}else if(p==="athlete"){setSelectedAthleteId(extra);setPage("athlete");}else setPage(p);setNavOpen(false);window.scrollTo({top:0});};
  const race=selectedRaceId?races.find(r=>r.id===selectedRaceId):null;
  const NAV=[
    {key:"dashboard",label:"Dashboard",icon:Snowflake},
    {key:"athletes",label:"Athletes",icon:Users},
    {key:"races",label:"Races",icon:Flag},
    {key:"analytics",label:"Analytics",icon:TrendingUp},
    {key:"season",label:"Season",icon:Calendar},
    {key:"settings",label:"Settings",icon:SettingsIcon},
  ];
  return <div className="nrr-root min-h-screen flex"><aside className={`fixed sm:static z-[100000] inset-y-0 left-0 w-72 border-r flex flex-col transition-transform sm:translate-x-0 ${navOpen?"translate-x-0":"-translate-x-full"}`} style={{borderColor:"#314A67",color:"#F4F8FC",backgroundColor:"#243B55"}}><div className="nrr-classic-lines" aria-hidden="true"/><div className="p-5 flex items-center gap-3 relative z-10"><div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{background:"rgba(255,255,255,.10)"}}><Snowflake size={27}/></div><span className="nrr-display text-base leading-tight">My Nordic<br/>Race Results</span></div><div className="px-5 pb-4 relative z-10"><span className="text-xs uppercase tracking-wider" style={{color:"#A9D8F4"}}>Coach Mode</span><div className="font-semibold mt-0.5">{TEAM_NAME} Nordic</div></div><nav className="flex-1 px-3 flex flex-col gap-1 overflow-y-auto nrr-scrollbar">{NAV.map(item=>{const active=page===item.key;return <button key={item.key} onClick={()=>goto(item.key)} className="nrr-focus relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-lg text-sm text-left transition-colors" style={{background:active?"rgba(112,168,210,.20)":"transparent",color:active?"#DDF1FF":"#D4E0EC",fontWeight:active?600:500}}>{active&&<span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{background:"var(--ice)"}}/>}<item.icon size={16} strokeWidth={active?2.3:2}/>{item.label}</button>})}</nav><div className="p-4 border-t text-sm" style={{borderColor:"var(--border)"}}><div className="font-medium">Mahtcoach</div><div className="text-xs mb-3" style={{color:"#B8C9DA"}}>{TEAM_NAME} Nordic · Coach</div><button onClick={onLogout} className="nrr-focus flex items-center gap-1.5 text-xs" style={{color:"#B8C9DA"}}><LogOut size={13}/> Log out</button></div></aside>{navOpen&&<div className="nrr-mobile-menu-overlay fixed inset-0 bg-black/30 z-[99999] sm:hidden" onClick={()=>setNavOpen(false)}/>}<main className="flex-1 min-w-0 pb-20 sm:pb-0"><div className="sm:hidden flex items-center justify-between p-5 border-b bg-white sticky top-0 z-[80]" style={{borderColor:"var(--border)"}}><button onClick={()=>setNavOpen(true)} className="nrr-focus p-1 -m-1"><Menu size={24}/></button><span className="nrr-display text-base">Coach Mode</span><button onClick={onLogout} className="nrr-focus p-1 -m-1"><LogOut size={18}/></button></div><div className="max-w-[96rem] mx-auto p-5 sm:p-10 lg:p-12">{page==="dashboard"&&<CoachDashboard races={races} athletes={athletes} goto={goto}/>} {page==="athletes"&&<AthletesPage races={races} athletes={athletes} goto={goto}/>} {page==="athlete"&&<AthleteDetail athleteId={selectedAthleteId} races={races} athletes={athletes} goto={goto}/>} {page==="races"&&<RacesPage races={races} athletes={athletes} goto={goto}/>} {page==="race"&&<RaceDetail race={race} athletes={athletes} goto={goto}/>} {page==="analytics"&&<AnalyticsPage races={races} athletes={athletes}/>} {page==="season"&&<SeasonPage races={races} athletes={athletes}/>} {page==="settings"&&<CoachSettings onLogout={onLogout}/>}</div></main><nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t flex items-stretch" style={{borderColor:"var(--border)",paddingBottom:"env(safe-area-inset-bottom)"}}>{NAV.slice(0,4).map(item=>{const active=page===item.key;return <button key={item.key} onClick={()=>goto(item.key)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:active?"var(--ice)":"var(--slate)"}}><item.icon size={19} strokeWidth={active?2.4:1.9}/><span className="text-[10px]">{item.label}</span></button>})}<button onClick={()=>setNavOpen(true)} className="nrr-focus flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5" style={{color:"var(--slate)"}}><Menu size={19}/><span className="text-[10px]">More</span></button></nav></div>;
}
