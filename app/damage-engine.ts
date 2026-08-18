import {AA_JOB_MOD,AA_USES_MAIN,baseDamage,clamp,expectedRoll,simulatedDotRoll,simulatedRoll,speedAdjustedTime} from "./calculation/damage-formula";
import {DOT_ACTIONS,findDotAction,type DotAction} from "./calculation/dot-actions";
import {GUARANTEED_ACTIONS,findGuaranteedAction,type GuaranteedAction} from "./calculation/guaranteed-actions";
import {JOB_CONFIGS,type ActionRule,type BuffRule,type JobConfig} from "./calculation/job-configs";

export type EngineStats = {
  level:number; weapon:number; autoAttack:number; aaInterval:number; main:number; aaMain:number;
  crit:number; dh:number; det:number; speed:number; tenacity:number; gcd:number;
  potionPercent:number; potionCap:number; simulationIterations:number;
};

export type EngineRow = {
  id:string; time:number; actionId:number|null; name:string; lane:"gcd"|"ability";
  potency:number; cast:number; recast:number; modifier:"none"|"delay"|"downtime"|"pre"|"potion";
  modifierValue:number;
  dotPotency?:number; dotDuration?:number; guaranteedCrit?:boolean; guaranteedDh?:boolean;
};

export type DotRule = { sourceActionId:number; key:string; potency:number; duration:number; tickInterval?:number };
export type ActionDataOverride={actionId:number;potency?:number;dotPotency?:number;dotDuration?:number;recast?:number;cast?:number;lane?:"gcd"|"ability";guaranteedCrit?:boolean;guaranteedDh?:boolean;evolve?:boolean};
export type DeveloperCalculationOverrides={dots?:DotAction[];guaranteed?:GuaranteedAction[];jobs?:Record<string,JobConfig>;actions?:Record<string,ActionDataOverride[]>};
export type {ActionRule,BuffRule,JobConfig};

export type EngineComputedRow<T extends EngineRow = EngineRow> = T & {
  prepare:number; damageEvent:number; nextGcd:number; nextOgcd:number; dps:number; simulatedDps:number;
  sumPotency:number; aaCount:number; totalDamage:number; simulatedDamage:number; rowDamage:number;
  aaDamage:number; dotDamage:number; dotDamageByAction:Record<string,number>;
};

type ActiveBuff = BuffRule & { starts:number; ends:number };
type DotInstance = DotRule & { sourceName:string; nextTick:number; ends:number; base:number; multipliers:number[]; crit:boolean; dh:boolean };
type Downtime = { start:number; end:number };

const applies=(buff:BuffRule,actionId:number|null)=>actionId!==null&&(!buff.include||buff.include.includes(actionId))&&(!buff.exclude||!buff.exclude.includes(actionId));
const overlap=(end:number,interval:Downtime)=>Math.max(0,Math.min(end,interval.end)-Math.max(0,interval.start));
const activeTime=(time:number,downtimes:Downtime[])=>Math.max(0,time-downtimes.reduce((sum,item)=>sum+overlap(time,item),0));
const targetable=(time:number,downtimes:Downtime[])=>!downtimes.some(item=>time>=item.start&&time<item.end);
const realTimeForActive=(target:number,downtimes:Downtime[])=>downtimes.slice().sort((a,b)=>a.start-b.start).reduce((time,item)=>item.start<=time?time+(item.end-item.start):time,target);

function hashSeed(rows:EngineRow[],stats:EngineStats,job:string){
  const source=`${job}|${JSON.stringify(stats)}|${rows.map(row=>`${row.actionId}:${row.time}:${row.potency}`).join("|")}`;
  let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0||1;
}
function rng(seed:number){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
export {speedAdjustedTime};
export function calculateDamage<T extends EngineRow>(rows:T[],stats:EngineStats,job:string,overrides:DeveloperCalculationOverrides={}):EngineComputedRow<T>[] {
  const config=(overrides.jobs||JOB_CONFIGS)[job]||{buffs:[],actions:{}},dotList=overrides.dots||DOT_ACTIONS,guaranteedList=overrides.guaranteed||GUARANTEED_ACTIONS,iterations=clamp(Math.round(stats.simulationIterations||1000),1,10000),partyMain=Math.floor(stats.main*1.05),aaUsesMain=AA_USES_MAIN.has(job),partyAaMain=Math.floor((aaUsesMain?stats.main:stats.aaMain)*1.05);
  const downtimes=rows.filter(row=>row.modifier==="downtime").map(row=>({start:row.time,end:row.time+Math.max(0,row.modifierValue)}));
  const random=rng(hashSeed(rows,stats,job));let nextGcd=0,nextOgcd=0,sumPotency=0,total=0,simTotal=0,previousAa=0,aaTotal=0,dotTotal=0;
  const activeBuffs:ActiveBuff[]=[],dots=new Map<string,DotInstance>(),dotBreakdown:Record<string,number>={};const output:EngineComputedRow<T>[]=[];
  for(const row of rows){
    const executionBuffs=row.actionId===null?[]:activeBuffs.filter(buff=>row.time>=buff.starts&&row.time<buff.ends&&applies(buff,row.actionId));
    const executionHaste=executionBuffs.reduce((value,buff)=>Math.max(value,buff.haste||0),0);
    const prepare=row.actionId===null?row.time:row.time+speedAdjustedTime(Math.max(0,row.cast||0),stats,executionHaste);
    const damageEvent=row.modifier==="delay"||row.modifier==="downtime"?row.time+Math.max(0,row.modifierValue):prepare;
    let rowDotDamage=0,rowDotSim=0,rowDotPotency=0;
      for(const [key,dot] of dots){while(dot.nextTick<=damageEvent&&dot.nextTick<=dot.ends){if(targetable(dot.nextTick,downtimes)){const expected=expectedRoll(dot.base,stats,dot.crit,dot.dh,dot.multipliers);rowDotDamage+=expected;rowDotPotency+=dot.potency;dotBreakdown[dot.sourceName]=(dotBreakdown[dot.sourceName]||0)+expected;let sample=0;for(let i=0;i<iterations;i++)sample+=simulatedDotRoll(dot.base,stats,random,dot.crit,dot.dh,dot.multipliers);rowDotSim+=sample/iterations}dot.nextTick+=(dot.tickInterval||3)}if(dot.nextTick>dot.ends)dots.delete(key)}
    dotTotal+=rowDotDamage;total+=rowDotDamage;simTotal+=rowDotSim;sumPotency+=rowDotPotency;
    let rowDamage=0,rowSim=0;
    if(row.modifier==="delay"||row.modifier==="downtime"){
      nextGcd=Math.max(nextGcd,row.time)+Math.max(0,row.modifierValue);nextOgcd=Math.max(nextOgcd,row.time)+Math.max(0,row.modifierValue);
    }else if(row.modifier==="potion"){
      activeBuffs.push({sourceActionId:-1,duration:30,mainStatPercent:Math.max(0,stats.potionPercent)/100,mainStatCap:Math.max(0,stats.potionCap),starts:row.time,ends:row.time+30});
      nextOgcd=Math.max(nextOgcd,row.time)+.7;
    }else if(row.actionId!==null){
      const buffs=activeBuffs.filter(buff=>prepare>=buff.starts&&prepare<buff.ends&&applies(buff,row.actionId));
      const actionOverride=overrides.actions?.[job]?.find(item=>item.actionId===row.actionId),configuredRule=(config.actions||{})[row.actionId]||{},listedGuaranteed=findGuaranteedAction(job,row.actionId,guaranteedList),actionRule={...configuredRule,guaranteedCrit:actionOverride?.guaranteedCrit??configuredRule.guaranteedCrit??listedGuaranteed?.crit??row.guaranteedCrit,guaranteedDh:actionOverride?.guaranteedDh??configuredRule.guaranteedDh??listedGuaranteed?.dh??row.guaranteedDh};
      const multipliers=[actionRule.multiplier||1,...buffs.map(buff=>buff.damageMultiplier||1)].filter(value=>value!==1);
      const mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0);
      const base=baseDamage(Math.max(0,row.potency),stats,job,partyMain+mainBonus,"direct",!!actionRule.guaranteedDh);
      rowDamage=expectedRoll(base,stats,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);
      for(let i=0;i<iterations;i++)rowSim+=simulatedRoll(base,stats,random,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);rowSim/=iterations;
      total+=rowDamage;simTotal+=rowSim;sumPotency+=Math.max(0,row.potency);
      const recast=speedAdjustedTime(row.recast||stats.gcd,stats,executionHaste);
      if(row.lane==="gcd")nextGcd=Math.max(nextGcd,row.time)+recast;nextOgcd=Math.max(nextOgcd,row.time)+.7;
      const listedDot=findDotAction(job,row.actionId,dotList),dotRule=actionOverride?(actionOverride.dotPotency&&actionOverride.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:actionOverride.dotPotency,duration:actionOverride.dotDuration}:undefined):listedDot?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:listedDot.potency,duration:listedDot.duration,tickInterval:listedDot.tickInterval}:(row.dotPotency&&row.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:row.dotPotency,duration:row.dotDuration}:undefined);
      if(dotRule){const tickInterval=dotRule.tickInterval||3,dotBase=baseDamage(dotRule.potency,stats,job,partyMain+mainBonus,"dot",!!actionRule.guaranteedDh),nextTick=(Math.floor(damageEvent/tickInterval)+1)*tickInterval;dots.set(dotRule.key,{...dotRule,sourceName:row.name,nextTick,ends:damageEvent+dotRule.duration,base:dotBase,multipliers,crit:!!actionRule.guaranteedCrit,dh:!!actionRule.guaranteedDh})}
      for(const buff of (config.buffs||[]).filter(rule=>rule.sourceActionId===row.actionId)){const starts=damageEvent+(buff.activationDelay||0);activeBuffs.push({...buff,starts,ends:starts+buff.duration})}
    }
    const aaCount=damageEvent>=0&&stats.aaInterval>0?Math.floor(activeTime(damageEvent,downtimes)/stats.aaInterval)+1:0,newAa=Math.max(0,aaCount-previousAa);
    let aaDamage=0,aaSim=0;
    for(let index=previousAa;index<aaCount;index++){
      const tickTime=realTimeForActive(index*stats.aaInterval,downtimes),buffs=activeBuffs.filter(buff=>tickTime>=buff.starts&&tickTime<buff.ends&&applies(buff,-1));
      const multipliers=buffs.map(buff=>buff.damageMultiplier||1).filter(value=>value!==1),mainBonus=aaUsesMain?buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0):0;
      const aaBase=baseDamage(Math.max(0,stats.autoAttack),stats,job,partyAaMain+mainBonus,"auto",false,AA_JOB_MOD[job]||100);aaDamage+=expectedRoll(aaBase,stats,false,false,multipliers);
      for(let i=0;i<iterations;i++)aaSim+=simulatedRoll(aaBase,stats,random,false,false,multipliers)/iterations;
    }
    previousAa=aaCount;
    aaTotal+=aaDamage;total+=aaDamage;simTotal+=aaSim;sumPotency+=newAa*Math.max(0,stats.autoAttack);
    output.push({...row,prepare,damageEvent,nextGcd,nextOgcd,dps:damageEvent>0?total/damageEvent:0,simulatedDps:damageEvent>0?simTotal/damageEvent:0,sumPotency,aaCount,totalDamage:total,simulatedDamage:simTotal,rowDamage,aaDamage:aaTotal,dotDamage:dotTotal,dotDamageByAction:{...dotBreakdown}});
  }
  return output;
}
