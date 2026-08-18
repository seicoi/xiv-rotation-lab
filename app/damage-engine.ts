export type EngineStats = {
  level:number; weapon:number; autoAttack:number; aaInterval:number; main:number;
  crit:number; dh:number; det:number; speed:number; tenacity:number; gcd:number;
  potionPercent:number; potionCap:number; simulationIterations:number;
};

export type EngineRow = {
  id:string; time:number; actionId:number|null; name:string; lane:"gcd"|"ability";
  potency:number; cast:number; recast:number; modifier:"none"|"delay"|"downtime"|"pre"|"potion";
  modifierValue:number;
};

export type BuffRule = {
  sourceActionId:number; duration:number; activationDelay?:number; damageMultiplier?:number;
  haste?:number; mainStatPercent?:number; mainStatCap?:number; include?:number[]; exclude?:number[];
};
export type DotRule = { sourceActionId:number; key:string; potency:number; duration:number; tickInterval?:number };
export type ActionRule = { guaranteedCrit?:boolean; guaranteedDh?:boolean; multiplier?:number };
export type JobCalculationConfig = { buffs:BuffRule[]; dots:DotRule[]; actions:Record<number,ActionRule> };

export type EngineComputedRow<T extends EngineRow = EngineRow> = T & {
  prepare:number; damageEvent:number; nextGcd:number; nextOgcd:number; dps:number; simulatedDps:number;
  sumPotency:number; aaCount:number; totalDamage:number; simulatedDamage:number; rowDamage:number;
  aaDamage:number; dotDamage:number; dotDamageByAction:Record<string,number>;
};

const LEVEL_MODS:Record<number,{main:number;sub:number;div:number;attack:number;tankAttack:number}>={
  70:{main:292,sub:364,div:900,attack:125,tankAttack:100},
  80:{main:340,sub:380,div:1300,attack:165,tankAttack:132},
  90:{main:390,sub:400,div:1900,attack:195,tankAttack:156},
  100:{main:440,sub:420,div:2780,attack:237,tankAttack:190},
};
const JOB_MOD:Record<string,number>={PLD:100,WAR:105,DRK:105,GNB:100,WHM:115,SCH:115,AST:115,SGE:115,MNK:110,DRG:115,NIN:110,SAM:112,RPR:115,VPR:110,BRD:115,MCH:115,DNC:115,BLM:115,SMN:115,RDM:115,PCT:115};
const TRAIT:Record<string,number>={PLD:100,WAR:100,DRK:100,GNB:100,WHM:130,SCH:130,AST:130,SGE:130,MNK:100,DRG:100,NIN:100,SAM:100,RPR:100,VPR:100,BRD:120,MCH:120,DNC:120,BLM:130,SMN:130,RDM:130,PCT:130};
const TANKS=new Set(["PLD","WAR","DRK","GNB"]);
const JOBS=Object.keys(JOB_MOD);

// Job-specific mechanics live in one registry. Entries are intentionally ID based so locale changes
// never change calculation behavior. Buff, DoT and special-action data can be extended independently.
export const JOB_CALCULATION_CONFIG:Record<string,JobCalculationConfig>=Object.fromEntries(
  JOBS.map(job=>[job,{buffs:[],dots:[],actions:{}}]),
);
// Verified current PvE rule. Further job mechanics are added here by stable action ID,
// including include/exclude lists for effects that do not apply to every action.
JOB_CALCULATION_CONFIG.PLD.buffs.push({sourceActionId:20,duration:20,damageMultiplier:1.25});

type ActiveBuff = BuffRule & { starts:number; ends:number };
type DotInstance = DotRule & { sourceName:string; nextTick:number; ends:number; base:number; multipliers:number[]; crit:boolean; dh:boolean };
type Downtime = { start:number; end:number };

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const applies=(buff:BuffRule,actionId:number|null)=>actionId!==null&&(!buff.include||buff.include.includes(actionId))&&(!buff.exclude||!buff.exclude.includes(actionId));
const overlap=(end:number,interval:Downtime)=>Math.max(0,Math.min(end,interval.end)-Math.max(0,interval.start));
const activeTime=(time:number,downtimes:Downtime[])=>Math.max(0,time-downtimes.reduce((sum,item)=>sum+overlap(time,item),0));
const targetable=(time:number,downtimes:Downtime[])=>!downtimes.some(item=>time>=item.start&&time<item.end);
const realTimeForActive=(target:number,downtimes:Downtime[])=>downtimes.slice().sort((a,b)=>a.start-b.start).reduce((time,item)=>item.start<=time?time+(item.end-item.start):time,target);

function factors(stats:EngineStats,job:string,mainOverride=stats.main){
  const mod=LEVEL_MODS[stats.level]||LEVEL_MODS[100],tank=TANKS.has(job),attackCoeff=tank?mod.tankAttack:mod.attack;
  return {mod,
    fAtk:Math.floor(attackCoeff*(mainOverride-mod.main)/mod.main)+100,
    fDet:Math.floor(140*(stats.det-mod.main)/mod.div+1000),
    fTnc:tank?Math.floor(112*(stats.tenacity-mod.sub)/mod.div+1000):1000,
    fWd:Math.floor(mod.main*(JOB_MOD[job]||100)/1000)+stats.weapon,
    fSpd:Math.floor(130*(stats.speed-mod.sub)/mod.div+1000),trait:TRAIT[job]||100,
  };
}

function rates(stats:EngineStats){
  const mod=(LEVEL_MODS[stats.level]||LEVEL_MODS[100]),delta=Math.floor(200*(stats.crit-mod.sub)/mod.div);
  return {critRate:clamp((delta+50)/1000,0,1),critPower:1400+delta,dhRate:clamp(Math.floor(550*(stats.dh-mod.sub)/mod.div)/1000,0,1)};
}

function baseDamage(potency:number,stats:EngineStats,job:string,main:number,kind:"direct"|"auto"|"dot",guaranteedDh=false){
  const f=factors(stats,job,main),autoDh=guaranteedDh?Math.floor(140*(stats.dh-f.mod.sub)/f.mod.div):0;
  let value=Math.floor(potency*f.fAtk*(f.fDet+autoDh)/100/1000);
  value=Math.floor(value*f.fTnc/1000);
  if(kind!=="direct")value=Math.floor(value*f.fSpd/1000);
  const weaponFactor=kind==="auto"?Math.floor(f.fWd*(stats.aaInterval/3)):f.fWd;
  value=Math.floor(value*weaponFactor/100);
  return Math.floor(value*f.trait/100);
}

const applyMultipliers=(base:number,multipliers:number[])=>multipliers.reduce((value,multiplier)=>Math.floor(value*multiplier),base);
function expectedRoll(base:number,stats:EngineStats,guaranteedCrit=false,guaranteedDh=false,multipliers:number[]=[]){
  const r=rates(stats),cr=guaranteedCrit?1:r.critRate,dh=guaranteedDh?1:r.dhRate;
  const normal=applyMultipliers(base,multipliers),crit=applyMultipliers(Math.floor(base*r.critPower/1000),multipliers),direct=applyMultipliers(Math.floor(base*125/100),multipliers),both=applyMultipliers(Math.floor(Math.floor(base*r.critPower/1000)*125/100),multipliers);
  return normal*(1-cr)*(1-dh)+crit*cr*(1-dh)+direct*(1-cr)*dh+both*cr*dh;
}

function hashSeed(rows:EngineRow[],stats:EngineStats,job:string){
  const source=`${job}|${JSON.stringify(stats)}|${rows.map(row=>`${row.actionId}:${row.time}:${row.potency}`).join("|")}`;
  let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0||1;
}
function rng(seed:number){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
function simulatedRoll(base:number,stats:EngineStats,random:()=>number,guaranteedCrit=false,guaranteedDh=false,multipliers:number[]=[]){
  const r=rates(stats);let value=base;
  if(guaranteedCrit||random()<r.critRate)value=Math.floor(value*r.critPower/1000);
  if(guaranteedDh||random()<r.dhRate)value=Math.floor(value*125/100);
  value=Math.floor(value*(950+Math.floor(random()*101))/1000);
  return applyMultipliers(value,multipliers);
}

// Allagan Studies: base delay is converted to ms, Speed is applied, then the game floors to centiseconds.
export function speedAdjustedTime(seconds:number,stats:EngineStats,haste=0){
  const mod=LEVEL_MODS[stats.level]||LEVEL_MODS[100],milliseconds=Math.round(Math.max(0,seconds)*1000);
  const speedTerm=1000+Math.ceil(130*(mod.sub-stats.speed)/mod.div);
  const speedMilliseconds=Math.floor(milliseconds*speedTerm/1000);
  return Math.floor(speedMilliseconds*(100-clamp(haste,0,99))/100/10)/100;
}

export function calculateDamage<T extends EngineRow>(rows:T[],stats:EngineStats,job:string):EngineComputedRow<T>[] {
  const config=JOB_CALCULATION_CONFIG[job]||{buffs:[],dots:[],actions:{}},iterations=clamp(Math.round(stats.simulationIterations||1000),1,10000),partyMain=Math.floor(stats.main*1.05);
  const downtimes=rows.filter(row=>row.modifier==="downtime").map(row=>({start:row.time,end:row.time+Math.max(0,row.modifierValue)}));
  const random=rng(hashSeed(rows,stats,job));let nextGcd=0,nextOgcd=0,sumPotency=0,total=0,simTotal=0,previousAa=0,aaTotal=0,dotTotal=0;
  const activeBuffs:ActiveBuff[]=[],dots=new Map<string,DotInstance>(),dotBreakdown:Record<string,number>={};const output:EngineComputedRow<T>[]=[];
  for(const row of rows){
    const executionBuffs=row.actionId===null?[]:activeBuffs.filter(buff=>row.time>=buff.starts&&row.time<buff.ends&&applies(buff,row.actionId));
    const executionHaste=executionBuffs.reduce((value,buff)=>Math.max(value,buff.haste||0),0);
    const prepare=row.actionId===null?row.time:row.time+speedAdjustedTime(Math.max(0,row.cast||0),stats,executionHaste),damageEvent=prepare;
    let rowDotDamage=0,rowDotSim=0,rowDotPotency=0;
    for(const [key,dot] of dots){while(dot.nextTick<=damageEvent&&dot.nextTick<=dot.ends){if(targetable(dot.nextTick,downtimes)){const expected=expectedRoll(dot.base,stats,dot.crit,dot.dh,dot.multipliers);rowDotDamage+=expected;rowDotPotency+=dot.potency;dotBreakdown[dot.sourceName]=(dotBreakdown[dot.sourceName]||0)+expected;let sample=0;for(let i=0;i<iterations;i++)sample+=simulatedRoll(dot.base,stats,random,dot.crit,dot.dh,dot.multipliers);rowDotSim+=sample/iterations}dot.nextTick+=(dot.tickInterval||3)}if(dot.nextTick>dot.ends)dots.delete(key)}
    dotTotal+=rowDotDamage;total+=rowDotDamage;simTotal+=rowDotSim;sumPotency+=rowDotPotency;
    let rowDamage=0,rowSim=0;
    if(row.modifier==="delay"||row.modifier==="downtime"){
      nextGcd=Math.max(nextGcd,row.time)+Math.max(0,row.modifierValue);nextOgcd=Math.max(nextOgcd,row.time)+Math.max(0,row.modifierValue);
    }else if(row.modifier==="potion"){
      activeBuffs.push({sourceActionId:-1,duration:30,mainStatPercent:Math.max(0,stats.potionPercent)/100,mainStatCap:Math.max(0,stats.potionCap),starts:row.time,ends:row.time+30});
    }else if(row.actionId!==null){
      const buffs=activeBuffs.filter(buff=>prepare>=buff.starts&&prepare<buff.ends&&applies(buff,row.actionId));
      const multipliers=[config.actions[row.actionId]?.multiplier||1,...buffs.map(buff=>buff.damageMultiplier||1)].filter(value=>value!==1);
      const mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0);
      const actionRule=config.actions[row.actionId]||{},base=baseDamage(Math.max(0,row.potency),stats,job,partyMain+mainBonus,"direct",!!actionRule.guaranteedDh);
      rowDamage=expectedRoll(base,stats,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);
      for(let i=0;i<iterations;i++)rowSim+=simulatedRoll(base,stats,random,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);rowSim/=iterations;
      total+=rowDamage;simTotal+=rowSim;sumPotency+=Math.max(0,row.potency);
      const recast=speedAdjustedTime(row.recast||stats.gcd,stats,executionHaste);
      if(row.lane==="gcd")nextGcd=Math.max(nextGcd,row.time)+recast;nextOgcd=Math.max(nextOgcd,row.time)+.7;
      const dotRule=config.dots.find(rule=>rule.sourceActionId===row.actionId);
      if(dotRule){const dotBase=baseDamage(dotRule.potency,stats,job,partyMain+mainBonus,"dot",!!actionRule.guaranteedDh);dots.set(dotRule.key,{...dotRule,sourceName:row.name,nextTick:damageEvent+(dotRule.tickInterval||3),ends:damageEvent+dotRule.duration,base:dotBase,multipliers,crit:!!actionRule.guaranteedCrit,dh:!!actionRule.guaranteedDh})}
      for(const buff of config.buffs.filter(rule=>rule.sourceActionId===row.actionId)){const starts=damageEvent+(buff.activationDelay||0);activeBuffs.push({...buff,starts,ends:starts+buff.duration})}
    }
    const aaCount=damageEvent>=0&&stats.aaInterval>0?Math.floor(activeTime(damageEvent,downtimes)/stats.aaInterval)+1:0,newAa=Math.max(0,aaCount-previousAa);
    let aaDamage=0,aaSim=0;
    for(let index=previousAa;index<aaCount;index++){
      const tickTime=realTimeForActive(index*stats.aaInterval,downtimes),buffs=activeBuffs.filter(buff=>tickTime>=buff.starts&&tickTime<buff.ends&&applies(buff,-1));
      const multipliers=buffs.map(buff=>buff.damageMultiplier||1).filter(value=>value!==1),mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0);
      const aaBase=baseDamage(Math.max(0,stats.autoAttack),stats,job,partyMain+mainBonus,"auto");aaDamage+=expectedRoll(aaBase,stats,false,false,multipliers);
      for(let i=0;i<iterations;i++)aaSim+=simulatedRoll(aaBase,stats,random,false,false,multipliers)/iterations;
    }
    previousAa=aaCount;
    aaTotal+=aaDamage;total+=aaDamage;simTotal+=aaSim;sumPotency+=newAa*Math.max(0,stats.autoAttack);
    output.push({...row,prepare,damageEvent,nextGcd,nextOgcd,dps:damageEvent>0?total/damageEvent:0,simulatedDps:damageEvent>0?simTotal/damageEvent:0,sumPotency,aaCount,totalDamage:total,simulatedDamage:simTotal,rowDamage,aaDamage:aaTotal,dotDamage:dotTotal,dotDamageByAction:{...dotBreakdown}});
  }
  return output;
}
