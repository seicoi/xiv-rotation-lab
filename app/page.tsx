"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Lane = "gcd" | "ability";
type Modifier = "none" | "delay" | "downtime" | "pre";
type CatalogAction = { id:number; name:string; lane:Lane; level:number; recast:number; iconPath:string };
type TimelineRow = { id:string; time:number; actionId:number|null; name:string; lane:Lane; potency:number; boss:string; iconPath:string; modifier:Modifier; modifierValue:number };
type Sheet = { id:string; name:string; job:string; rows:TimelineRow[] };
type Stats = { level:number; weapon:number; main:number; crit:number; dh:number; det:number; gcd:number };

const JOBS = ["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];
const JOB_NAMES:Record<string,string>={PLD:"ナイト",WAR:"戦士",DRK:"暗黒騎士",GNB:"ガンブレイカー",WHM:"白魔道士",SCH:"学者",AST:"占星術師",SGE:"賢者",MNK:"モンク",DRG:"竜騎士",NIN:"忍者",SAM:"侍",RPR:"リーパー",VPR:"ヴァイパー",BRD:"吟遊詩人",MCH:"機工士",DNC:"踊り子",BLM:"黒魔道士",SMN:"召喚士",RDM:"赤魔道士",PCT:"ピクトマンサー"};
const FALLBACK:Record<string,CatalogAction[]>={
  PLD:[
    {id:9,name:"ファストブレード",lane:"gcd",level:1,recast:2.5,iconPath:"ui/icon/000000/000158_hr1.tex"},
    {id:15,name:"ライオットソード",lane:"gcd",level:4,recast:2.5,iconPath:"ui/icon/000000/000156_hr1.tex"},
    {id:20,name:"ファイト・オア・フライト",lane:"ability",level:2,recast:60,iconPath:"ui/icon/000000/000166_hr1.tex"},
    {id:23,name:"サークル・オブ・ドゥーム",lane:"ability",level:50,recast:30,iconPath:"ui/icon/000000/000161_hr1.tex"},
  ]
};
const STATS:Stats={level:100,weapon:152,main:5857,crit:3242,dh:1230,det:2883,gcd:2.5};
const newSheet=(job:string,index=1):Sheet=>({id:crypto.randomUUID(),name:index===1?"本番回し":`比較案 ${index}`,job,rows:[]});
const iconUrl=(path:string)=>path?`https://v2.xivapi.com/api/asset?path=${encodeURIComponent(path)}&format=png`:"";
const timeText=(n:number)=>{const sign=n<0?"-":"";const v=Math.abs(n);return `${sign}${String(Math.floor(v/60)).padStart(2,"0")}:${(v%60).toFixed(1).padStart(4,"0")}`};
const damage=(p:number,s:Stats)=>p*34.2*(s.weapon/152)*(s.main/5857)*(1+(s.det-420)/19000)*(1+Math.max(.05,(s.crit-420)/190000+.05)*.55)*(1+Math.max(0,(s.dh-420)/55000)*.25);

export default function Home(){
  const [job,setJob]=useState("PLD"),[sheets,setSheets]=useState<Sheet[]>([]),[active,setActive]=useState("");
  const [stats,setStats]=useState(STATS),[catalogs,setCatalogs]=useState<Record<string,CatalogAction[]>>({PLD:FALLBACK.PLD}),[loading,setLoading]=useState(false);
  const [panel,setPanel]=useState<"timeline"|"actions"|"stats">("timeline"),[picker,setPicker]=useState<Lane|null>(null),[query,setQuery]=useState("");
  const [modifier,setModifier]=useState<Modifier>("none"),[modifierValue,setModifierValue]=useState(0),[bossOn,setBossOn]=useState(true),[saved,setSaved]=useState(false);
  const hydrated=useRef(false);

  useEffect(()=>{const raw=localStorage.getItem("xiv-rotation-lab-v2");if(raw)try{const v=JSON.parse(raw);setSheets(v.sheets||[]);setActive(v.active||"");setJob(v.job||"PLD");setStats(v.stats||STATS)}catch{}hydrated.current=true},[]);
  useEffect(()=>{if(!hydrated.current)return;if(!sheets.some(s=>s.job===job)){const s=newSheet(job);setSheets(v=>[...v,s]);setActive(s.id)}else if(!sheets.some(s=>s.id===active&&s.job===job)){setActive(sheets.find(s=>s.job===job)!.id)}},[job,sheets,active]);
  useEffect(()=>{if(!hydrated.current)return;const t=setTimeout(()=>{localStorage.setItem("xiv-rotation-lab-v2",JSON.stringify({sheets,active,job,stats}));setSaved(true);setTimeout(()=>setSaved(false),700)},250);return()=>clearTimeout(t)},[sheets,active,job,stats]);
  useEffect(()=>{if(catalogs[job])return;setLoading(true);fetch(`/api/actions?job=${job}&level=${stats.level}`).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(data=>setCatalogs(v=>({...v,[job]:data.actions||[]}))).catch(()=>setCatalogs(v=>({...v,[job]:FALLBACK[job]||[]}))).finally(()=>setLoading(false))},[job,catalogs,stats.level]);

  const jobSheets=sheets.filter(s=>s.job===job),sheet=jobSheets.find(s=>s.id===active)||jobSheets[0],catalog=catalogs[job]||[];
  const shown=useMemo(()=>catalog.filter(a=>a.lane===picker&&a.level<=stats.level&&a.name.includes(query)).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,"ja")),[catalog,picker,query,stats.level]);
  const rows=sheet?.rows||[],timelineEnd=Math.max(0,...rows.map(r=>r.time+((r.modifier==="delay"||r.modifier==="downtime")?Math.max(0,r.modifierValue):0))),duration=timelineEnd+stats.gcd,total=rows.reduce((n,r)=>n+r.potency,0),expected=duration?rows.reduce((n,r)=>n+damage(r.potency,stats),0)/duration:0;
  const setRows=(next:TimelineRow[])=>setSheets(v=>v.map(s=>s.id===sheet?.id?{...s,rows:next}:s));
  const pick=(a:CatalogAction)=>{let time=rows.length?timelineEnd+(a.lane==="gcd"?stats.gcd:.7):0;if(modifier==="pre")time-=modifierValue;setRows([...rows,{id:crypto.randomUUID(),time,actionId:a.id,name:a.name,lane:a.lane,potency:0,boss:"",iconPath:a.iconPath,modifier,modifierValue}].sort((a,b)=>a.time-b.time));setPicker(null);setQuery("");setModifier("none");setModifierValue(0)};
  const addPseudo=(kind:"delay"|"downtime")=>{setRows([...rows,{id:crypto.randomUUID(),time:timelineEnd,actionId:null,name:kind==="delay"?"ディレイ":"ダウンタイム",lane:"ability",potency:0,boss:"",iconPath:"",modifier:kind,modifierValue:Math.max(.1,modifierValue||1)}]);setModifierValue(0)};
  const addSheet=()=>{const s=newSheet(job,jobSheets.length+1);setSheets(v=>[...v,s]);setActive(s.id)};
  const deleteRow=(id:string)=>setRows(rows.filter(r=>r.id!==id));
  const visibleRows=rows.map((r,i)=>({r,i}));

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">X</span><div><strong>XIV ROTATION LAB</strong><small>SYSTEM PROTOTYPE</small></div></div><nav><button className={panel==="timeline"?"nav-active":""} onClick={()=>setPanel("timeline")}>TIMELINE</button><button className={panel==="actions"?"nav-active":""} onClick={()=>setPanel("actions")}>ACTION LIST</button><button className={panel==="stats"?"nav-active":""} onClick={()=>setPanel("stats")}>STATS</button></nav></header>
    <section className="sheet-head"><div><p className="eyebrow">JOB WORKSPACE</p><div className="job-title"><select value={job} onChange={e=>setJob(e.target.value)}>{JOBS.map(j=><option key={j} value={j}>{j} — {JOB_NAMES[j]}</option>)}</select><h1>{JOB_NAMES[job]} ローテーション</h1></div></div><div className="tabs">{jobSheets.map(s=><button key={s.id} className={s.id===sheet?.id?"active":""} onClick={()=>setActive(s.id)}>{s.name}</button>)}<button className="plus" onClick={addSheet}>＋</button></div></section>
    <section className="metrics"><article><span>EXPECTED DPS</span><strong>{Math.round(expected).toLocaleString()}</strong><small>現在のジョブシートのみ</small></article><article><span>ACTION DATA</span><strong>{loading?"…":catalog.length}</strong><small>{job} / Lv.{stats.level} / XIVAPI v2</small></article><article><span>TOTAL POTENCY</span><strong>{total.toLocaleString()}</strong><small>{duration.toFixed(1)} sec</small></article><article><span>LOCAL SAVE</span><strong>{saved?"SAVED":"READY"}</strong><small>job-scoped schema v2</small></article></section>

    {panel==="timeline"&&<><section className="system-toolbar"><div className="lane-buttons"><button onClick={()=>setPicker("gcd")}>＋ GCD</button><button onClick={()=>setPicker("ability")}>＋ アビリティ</button></div><div className="modifier-controls"><input aria-label="修飾子の秒数" type="number" step=".1" value={modifierValue} onChange={e=>setModifierValue(Number(e.target.value))}/><span>秒</span><button onClick={()=>addPseudo("delay")}>DELAYを挿入</button><button onClick={()=>addPseudo("downtime")}>DOWNTIMEを挿入</button></div><label><input type="checkbox" checked={bossOn} onChange={e=>setBossOn(e.target.checked)}/> ボスタイムライン</label></section>
      <section className="split-timeline"><div className="split-head"><span># / TIME</span><span>GCD</span><span>アビリティ</span>{bossOn&&<span>BOSS</span>}<span>DAMAGE</span></div>{visibleRows.length?visibleRows.map(({r,i})=><div className="split-row" key={r.id}><span className="row-time"><b>{String(i+1).padStart(2,"0")}</b>{timeText(r.time)}{r.modifier!=="none"&&<em>{r.modifier} {r.modifierValue}</em>}</span><span>{r.lane==="gcd"?<ActionCell row={r} onDelete={deleteRow}/>:null}</span><span>{r.lane==="ability"?<ActionCell row={r} onDelete={deleteRow}/>:null}</span>{bossOn&&<span className="boss-cell"><input placeholder="ボスアクション" value={r.boss} onChange={e=>setRows(rows.map(x=>x.id===r.id?{...x,boss:e.target.value}:x))}/></span>}<span className="damage">{r.potency?Math.round(damage(r.potency,stats)).toLocaleString():"—"}</span></div>):<div className="empty-state"><b>{job} のタイムラインは空です</b><span>「＋ GCD」または「＋ アビリティ」から、このジョブのアクションを選択してください。</span></div>}</section></>}
    {panel==="actions"&&<section className="action-library"><div className="section-title"><div><p className="eyebrow">XIVAPI ACTION SHEET</p><h2>{job} アクション一覧</h2></div><span>{loading?"取得中…":`${catalog.length} actions`}</span></div><div className="action-grid">{catalog.map(a=><button key={a.id} onClick={()=>{setPicker(a.lane);setQuery(a.name)}}><img src={iconUrl(a.iconPath)} alt=""/><span><b>{a.name}</b><small>Lv.{a.level} · {a.lane==="gcd"?"GCD":"アビリティ"} · {a.recast}s</small></span></button>)}</div></section>}
    {panel==="stats"&&<section className="form-card"><div className="section-title"><div><p className="eyebrow">CHARACTER INPUT</p><h2>{job} ステータス</h2></div></div><div className="form-grid">{Object.entries(stats).map(([k,v])=><label key={k}>{k.toUpperCase()}<input type="number" value={v} step={k==="gcd"?.01:1} onChange={e=>setStats({...stats,[k]:Number(e.target.value)})}/></label>)}</div></section>}
    <footer><span><b className="dot"/> ジョブ別にブラウザ保存</span><span>Action source: XIVAPI v2 / ja</span></footer>

    {picker&&<div className="overlay" onMouseDown={()=>setPicker(null)}><section className="picker" onMouseDown={e=>e.stopPropagation()}><div className="picker-head"><div><p className="eyebrow">{job} / {picker==="gcd"?"GCD":"ABILITY"}</p><h2>アクションを選択</h2></div><button className="close" onClick={()=>setPicker(null)}>×</button></div><input className="action-search" autoFocus placeholder="アクション名で検索" value={query} onChange={e=>setQuery(e.target.value)}/><div className="picker-mod"><span>追加時の修飾子</span><select value={modifier} onChange={e=>setModifier(e.target.value as Modifier)}><option value="none">なし</option><option value="pre">pre</option></select>{modifier==="pre"&&<input type="number" step=".1" value={modifierValue} onChange={e=>setModifierValue(Number(e.target.value))}/>}<small>{modifier==="pre"?"指定秒数だけ前の時刻へ配置":"通常時刻へ配置"}</small></div><div className="picker-list">{shown.map(a=><button key={a.id} onClick={()=>pick(a)}><img src={iconUrl(a.iconPath)} alt=""/><span><b>{a.name}</b><small>Lv.{a.level} · Recast {a.recast}s</small></span></button>)}{!shown.length&&<p className="no-results">{loading?"XIVAPIから取得しています…":"条件に一致するアクションがありません"}</p>}</div></section></div>}
  </main>
}

function ActionCell({row,onDelete}:{row:TimelineRow,onDelete:(id:string)=>void}){
  return <span className={`action-cell ${row.modifier==="delay"||row.modifier==="downtime"?"pseudo":""}`}>{row.iconPath?<img src={iconUrl(row.iconPath)} alt=""/>:<i>{row.modifier==="delay"?"⏱":"⇥"}</i>}<span><b>{row.name}</b>{row.modifier!=="none"&&<small>{row.modifier.toUpperCase()} {row.modifierValue}s</small>}</span><button aria-label="削除" onClick={()=>onDelete(row.id)}>×</button></span>
}
