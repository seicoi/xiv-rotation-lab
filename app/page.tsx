"use client";

import { useEffect, useRef, useState } from "react";

type ActionRow = { id:string; time:number; action:string; potency:number; boss:string; type:"gcd"|"ogcd"|"buff"; enhanced?:boolean };
type Sheet = { id:string; name:string; rows:ActionRow[] };
type Stats = { level:number; weapon:number; main:number; crit:number; dh:number; det:number; gcd:number };

const seedRows: ActionRow[] = [
  {id:"a1",time:0,action:"ファストブレード",potency:220,boss:"戦闘開始",type:"gcd"},
  {id:"a2",time:1.2,action:"ファイト・オア・フライト",potency:0,boss:"",type:"buff"},
  {id:"a3",time:2.5,action:"ライオットソード",potency:170,boss:"AA",type:"gcd"},
  {id:"a4",time:3.1,action:"サークル・オブ・ドゥーム",potency:100,boss:"",type:"ogcd"},
  {id:"a5",time:5,action:"ロイヤルアソリティ",potency:420,boss:"",type:"gcd"},
  {id:"a6",time:7.5,action:"ホーリースピリット",potency:500,boss:"ばりばりルインガ",type:"gcd",enhanced:true},
  {id:"a7",time:10,action:"アトーンメント",potency:460,boss:"AA",type:"gcd"},
];
const defaults: Sheet[] = [{id:"main",name:"本番回し",rows:seedRows},{id:"alt",name:"比較案 B",rows:seedRows.map((r,i)=>({...r,id:"b"+i,potency:i===5?400:r.potency}))}];
const defaultStats: Stats = {level:100,weapon:152,main:5857,crit:3242,dh:1230,det:2883,gcd:2.5};
const jobs = ["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];

function multiplier(s:Stats){ return (s.weapon/152)*(s.main/5857)*(1+(s.det-420)/19000); }
function expectedDamage(p:number,s:Stats){ const crit=Math.max(0.05,(s.crit-420)/1900/100+0.05); const dh=Math.max(0,(s.dh-420)/550/100); return p*34.2*multiplier(s)*(1+crit*.55)*(1+dh*.25); }
function clock(n:number){ const m=Math.floor(n/60); return `${String(m).padStart(2,"0")}:${(n%60).toFixed(1).padStart(4,"0")}`; }

export default function Home(){
  const [sheets,setSheets]=useState<Sheet[]>(defaults),[active,setActive]=useState("main"),[job,setJob]=useState("PLD");
  const [stats,setStats]=useState(defaultStats),[trials,setTrials]=useState(10000),[bossOn,setBossOn]=useState(true),[actionsOn,setActionsOn]=useState(true);
  const [panel,setPanel]=useState<"timeline"|"stats"|"simulation"|"database">("timeline"),[modal,setModal]=useState<"import"|"compare"|null>(null);
  const [simulated,setSimulated]=useState<number|null>(null),[saved,setSaved]=useState(false), fileRef=useRef<HTMLInputElement>(null);
  const sheet=sheets.find(s=>s.id===active)??sheets[0];
  const totalPotency=sheet.rows.reduce((a,r)=>a+r.potency,0), duration=Math.max(1,...sheet.rows.map(r=>r.time))+2.5;
  const expected=sheet.rows.reduce((a,r)=>a+expectedDamage(r.potency,stats),0)/duration;
  const comparison=sheets.map(s=>({name:s.name,dps:s.rows.reduce((a,r)=>a+expectedDamage(r.potency,stats),0)/(Math.max(1,...s.rows.map(r=>r.time))+2.5)}));

  useEffect(()=>{const raw=localStorage.getItem("xiv-rotation-lab");if(raw)try{const v=JSON.parse(raw);setSheets(v.sheets||defaults);setStats(v.stats||defaultStats);setJob(v.job||"PLD")}catch{}},[]);
  useEffect(()=>{const t=setTimeout(()=>{localStorage.setItem("xiv-rotation-lab",JSON.stringify({sheets,stats,job}));setSaved(true);setTimeout(()=>setSaved(false),900)},350);return()=>clearTimeout(t)},[sheets,stats,job]);
  const updateRows=(rows:ActionRow[])=>setSheets(v=>v.map(s=>s.id===active?{...s,rows}:s));
  const addSheet=()=>{const id=crypto.randomUUID();setSheets(v=>[...v,{id,name:`比較案 ${v.length+1}`,rows:sheet.rows.map(r=>({...r,id:crypto.randomUUID()}))}]);setActive(id)};
  const runSimulation=()=>{let sum=0;const c=Math.min(50000,Math.max(100,Number(trials)||100));for(let i=0;i<c;i++){let damage=0;for(const r of sheet.rows){let d=r.potency*34.2*multiplier(stats);const cr=Math.max(.05,(stats.crit-420)/1900/100+.05),dh=Math.max(0,(stats.dh-420)/550/100);if(Math.random()<cr)d*=1.55;if(Math.random()<dh)d*=1.25;damage+=d}sum+=damage/duration}setSimulated(sum/c)};
  const addAction=()=>updateRows([...sheet.rows,{id:crypto.randomUUID(),time:Math.round(duration*10)/10,action:"アクションを選択",potency:100,boss:"",type:"gcd"}]);
  const importFile=(f?:File)=>{if(!f)return;f.text().then(text=>{try{const parsed=JSON.parse(text);const arr=Array.isArray(parsed)?parsed:parsed.rows;if(!Array.isArray(arr))throw 0;updateRows(arr.map((r:any,i:number)=>({id:crypto.randomUUID(),time:Number(r.time??i*2.5),action:String(r.action??r.name??"Unknown"),potency:Number(r.potency??0),boss:String(r.boss??""),type:r.type==="ogcd"||r.type==="buff"?r.type:"gcd"})))}catch{const lines=text.split(/\r?\n/).filter(Boolean);updateRows(lines.slice(1).map((l,i)=>{const c=l.split(",");return{id:crypto.randomUUID(),time:Number(c[0])||i*2.5,action:c[1]||"Unknown",potency:Number(c[2])||0,boss:c[3]||"",type:"gcd"}}))}setModal(null)})};

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">X</span><div><strong>XIV ROTATION LAB</strong><small>DAMAGE SIMULATOR</small></div></div><nav><button className={panel!=="database"?"nav-active":""} onClick={()=>setPanel("timeline")}>SIMULATOR</button><button className={panel==="database"?"nav-active":""} onClick={()=>setPanel("database")}>ACTIONS</button><button onClick={()=>setModal("compare")}>ROTATIONS</button></nav><button className="import-button" onClick={()=>setModal("import")}>↥ IMPORT</button></header>
    <section className="sheet-head"><div><p className="eyebrow">WORKSPACE / {job}</p><h1>{job} — 2分バースト検証</h1></div><div className="tabs">{sheets.map(s=><button key={s.id} className={s.id===active?"active":""} onClick={()=>setActive(s.id)}>{s.name} {s.id===active&&<span>●</span>}</button>)}<button className="plus" onClick={addSheet}>＋</button></div></section>
    <section className="metrics"><article><span>EXPECTED DPS</span><strong>{Math.round(expected).toLocaleString()}</strong><small className="up">理論期待値</small></article><article><span>SIMULATED AVG</span><strong>{simulated?Math.round(simulated).toLocaleString():"—"}</strong><small>{Number(trials).toLocaleString()} trials</small></article><article><span>TOTAL POTENCY</span><strong>{totalPotency.toLocaleString()}</strong><small>{duration.toFixed(1)} sec</small></article><article className="stats"><span>JOB / LEVEL</span><strong>{job} <em>Lv.{stats.level}</em></strong><small>CRT {stats.crit.toLocaleString()} · DH {stats.dh.toLocaleString()} · DET {stats.det.toLocaleString()}</small></article></section>
    <section className="toolbar"><div><button className={panel==="timeline"?"tool-active":""} onClick={()=>setPanel("timeline")}>▦ Timeline</button><button className={panel==="stats"?"tool-active":""} onClick={()=>setPanel("stats")}>◫ Stats</button><button className={panel==="simulation"?"tool-active":""} onClick={()=>setPanel("simulation")}>⌁ Simulation</button></div><div className="toggles"><label><input type="checkbox" checked={bossOn} onChange={e=>setBossOn(e.target.checked)}/> Boss timeline</label><label><input type="checkbox" checked={actionsOn} onChange={e=>setActionsOn(e.target.checked)}/> Action timeline</label><button className="add" onClick={addAction}>＋ Add action</button></div></section>
    {panel==="stats"?<section className="form-card"><div className="section-title"><div><p className="eyebrow">CHARACTER INPUT</p><h2>ステータス設定</h2></div><span>Lv.70 / 80 / 90 / 100 対応</span></div><div className="form-grid"><label>JOB<select value={job} onChange={e=>setJob(e.target.value)}>{jobs.map(j=><option key={j}>{j}</option>)}</select></label>{Object.entries(stats).map(([k,v])=><label key={k}>{k.toUpperCase()}<input type="number" step={k==="gcd"?0.01:1} value={v} onChange={e=>setStats({...stats,[k]:Number(e.target.value)})}/></label>)}</div><p className="notice">レベル別係数はMVPの近似モデルです。パッチ別レベル補正テーブルを追加できるデータ構造にしています。</p></section>
    :panel==="simulation"?<section className="form-card simulation"><div><p className="eyebrow">MONTE CARLO</p><h2>実戦DPSシミュレーション</h2><p>各ヒットのクリティカルとダイレクトヒットを独立抽選し、平均DPSを算出します。</p></div><label>反復回数<input type="number" min="100" max="50000" step="100" value={trials} onChange={e=>setTrials(Number(e.target.value))}/></label><button className="run" onClick={runSimulation}>▶ SIMULATE</button>{simulated&&<strong className="sim-result">{Math.round(simulated).toLocaleString()} <small>DPS</small></strong>}</section>
    :panel==="database"?<section className="form-card"><div className="section-title"><div><p className="eyebrow">ACTION DATABASE</p><h2>パッチデータ</h2></div><button className="run">XIVAPI 同期設定</button></div><div className="versions"><article><b>7.3.0</b><span>CURRENT</span><small>PLD · 34 actions · ローカルキャッシュ</small></article><article><b>7.2.0</b><span>PREVIOUS</span><small>差分: 威力変更 4件 / 新規 2件</small></article></div><p className="notice">公開時はXIVAPIへの直接依存を避け、ビルド時または管理用同期処理で取得したJSONをバージョン単位で保存します。</p></section>
    :<section className="timeline-card"><div className="grid-head"><span>#</span><span>TIME</span><span>PLAYER ACTION</span><span>POTENCY</span>{bossOn&&<span>BOSS TIMELINE</span>}<span>EST. DAMAGE</span></div>{sheet.rows.map((row,index)=><div className={`grid-row ${!bossOn?"no-boss":""}`} key={row.id}><span className="index">{String(index+1).padStart(2,"0")}</span><span className="time">{clock(row.time)}</span><span className="action">{actionsOn?<><i className={row.type}>{row.type==="buff"?"◆":row.type==="ogcd"?"✦":"◇"}</i><input value={row.action} onChange={e=>updateRows(sheet.rows.map(r=>r.id===row.id?{...r,action:e.target.value}:r))}/></>:<span className="muted">非表示</span>}</span><span><input className="cell-number" type="number" value={row.potency} onChange={e=>updateRows(sheet.rows.map(r=>r.id===row.id?{...r,potency:Number(e.target.value)}:r))}/>{row.enhanced&&<b className="enhanced">強化</b>}</span>{bossOn&&<span className={row.boss?"boss":"muted"}>{row.boss||"—"}</span>}<span className="damage">{row.potency?Math.round(expectedDamage(row.potency,stats)).toLocaleString():"—"}</span></div>)}<button className="append" onClick={addAction}>＋ アクションを追加</button></section>}
    <footer><span><b className="dot"/> {saved?"保存しました":"ブラウザ内に自動保存"}</span><span>Patch 7.3 · Action DB 7.3.0</span></footer>
    {modal&&<div className="overlay" onMouseDown={()=>setModal(null)}><section className="modal" onMouseDown={e=>e.stopPropagation()}><button className="close" onClick={()=>setModal(null)}>×</button>{modal==="import"?<><p className="eyebrow">IMPORT</p><h2>タイムラインを読み込む</h2><p>CSV / JSON のアクション列とボス列を読み込みます。軽減表は Time・Action・Damage 列を抽出して利用できます。</p><div className="import-options"><button onClick={()=>fileRef.current?.click()}><b>CSV / JSON</b><small>ローカルファイル</small></button><button><b>FFLogs</b><small>レポートURL + API接続</small></button><button><b>Google Sheets</b><small>公開CSV URL</small></button></div><input ref={fileRef} hidden type="file" accept=".csv,.json,text/csv,application/json" onChange={e=>importFile(e.target.files?.[0])}/><div className="spec">CSV例: <code>time,action,potency,boss</code></div></>:<><p className="eyebrow">SHEET COMPARISON</p><h2>回しを比較</h2>{comparison.map((c,i)=><div className="compare-row" key={c.name}><b>{c.name}</b><span>{Math.round(c.dps).toLocaleString()} DPS</span><em>{i===0?"BASE":`${((c.dps/comparison[0].dps-1)*100).toFixed(2)}%`}</em></div>)}</>}</section></div>}
  </main>
}
