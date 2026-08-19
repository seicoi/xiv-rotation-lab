import {AA_JOB_MOD,AA_USES_MAIN,autoAttackPotency,baseDamage,clamp,expectedRoll,gcdCycleTime,simulatedDotRoll,simulatedRoll,speedAdjustedTime} from "./calculation/damage-formula";
import {DOT_ACTIONS,findDotAction,type DotAction} from "./calculation/dot-actions";
import {GUARANTEED_ACTIONS,findGuaranteedAction,type GuaranteedAction} from "./calculation/guaranteed-actions";
import {JOB_CONFIGS,type ActionRule,type BuffRule,type JobConfig} from "./calculation/job-configs";
import {findPetCorrectionProfile,petFormulaOverrides,petMainStat} from "./calculation/pet-configs";

export type EngineStats = {
  level:number; weapon:number; aaInterval:number; aaSpeed:number; main:number; aaMain:number;
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
export type ActionDataOverride={actionId:number;potency?:number;dotPotency?:number;dotDuration?:number;recast?:number;cast?:number;lane?:"gcd"|"ability";guaranteedCrit?:boolean;guaranteedDh?:boolean;petCorrection?:boolean;evolve?:boolean};
export type DeveloperCalculationOverrides={dots?:DotAction[];guaranteed?:GuaranteedAction[];jobs?:Record<string,JobConfig>;actions?:Record<string,ActionDataOverride[]>};
export type {ActionRule,BuffRule,JobConfig};

export type EngineComputedRow<T extends EngineRow = EngineRow> = T & {
  prepare:number; damageEvent:number; nextGcd:number; nextOgcd:number; dps:number; simulatedDps:number;
  sumPotency:number; aaCount:number; totalDamage:number; simulatedDamage:number; rowDamage:number;
  aaDamage:number; dotDamage:number; dotDamageByAction:Record<string,number>;
};

type ActiveBuff = BuffRule & { starts:number; ends:number; remainingStacks?:number };
type DotInstance = DotRule & { sourceName:string; nextTick:number; ends:number; base:number; multipliers:number[]; crit:boolean; dh:boolean };
type Downtime = { start:number; end:number };

const applies=(buff:BuffRule,actionId:number|null)=>actionId!==null&&(!buff.include||buff.include.includes(actionId))&&(!buff.exclude||!buff.exclude.includes(actionId));
const targetable=(time:number,downtimes:Downtime[])=>!downtimes.some(item=>time>=item.start&&time<item.end);
function addActiveDuration(start:number,duration:number,downtimes:Downtime[]){let cursor=start,remaining=Math.max(0,duration);for(const item of downtimes.slice().sort((a,b)=>a.start-b.start)){if(item.end<=cursor)continue;if(item.start>=cursor+remaining)break;if(item.start>cursor){remaining-=item.start-cursor;cursor=item.start}cursor=Math.max(cursor,item.end)}return cursor+remaining}

function hashSeed(rows:EngineRow[],stats:EngineStats,job:string){
  const source=`${job}|${JSON.stringify(stats)}|${rows.map(row=>`${row.actionId}:${row.time}:${row.potency}`).join("|")}`;
  let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0||1;
}
function rng(seed:number){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
export {speedAdjustedTime};
export function calculateDamage<T extends EngineRow>(rows:T[],stats:EngineStats,job:string,overrides:DeveloperCalculationOverrides={}):EngineComputedRow<T>[] {
  const config=(overrides.jobs||JOB_CONFIGS)[job]||{buffs:[],actions:{}},dotList=overrides.dots||DOT_ACTIONS,guaranteedList=overrides.guaranteed||GUARANTEED_ACTIONS,iterations=clamp(Math.round(stats.simulationIterations||1000),1,10000),mainStat=stats.main,aaUsesMain=AA_USES_MAIN.has(job),aaMain=aaUsesMain?stats.main:stats.aaMain,aaPotency=autoAttackPotency(job),aaFormulaStats={...stats,speed:stats.aaSpeed};
  const downtimes=rows.filter(row=>row.modifier==="downtime").map(row=>({start:row.time,end:row.time+Math.max(0,row.modifierValue)}));
  const random=rng(hashSeed(rows,stats,job));let nextGcd=0,nextOgcd=0,nextAa=0,aaCount=0,sumPotency=0,total=0,simTotal=0,aaTotal=0,dotTotal=0;
  const activeBuffs:ActiveBuff[]=[],dots=new Map<string,DotInstance>(),dotBreakdown:Record<string,number>={};const output:EngineComputedRow<T>[]=[];
  for(const row of rows){
    const executionBuffs=row.actionId===null?[]:activeBuffs.filter(buff=>row.time>=buff.starts&&row.time<buff.ends&&(buff.remainingStacks===undefined||buff.remainingStacks>0)&&applies(buff,row.actionId));
    const executionHaste=executionBuffs.reduce((value,buff)=>Math.max(value,buff.haste||0),config.passiveHaste||0);
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
      nextOgcd=Math.max(nextOgcd,row.time)+.675;
    }else if(row.actionId!==null){
      const buffs=activeBuffs.filter(buff=>prepare>=buff.starts&&prepare<buff.ends&&applies(buff,row.actionId));
      const actionOverride=overrides.actions?.[job]?.find(item=>item.actionId===row.actionId),configuredRule=(config.actions||{})[row.actionId]||{},listedGuaranteed=findGuaranteedAction(job,row.actionId,guaranteedList),actionRule={...configuredRule,petCorrection:actionOverride?.petCorrection??configuredRule.petCorrection,guaranteedCrit:actionOverride?.guaranteedCrit??configuredRule.guaranteedCrit??listedGuaranteed?.crit??row.guaranteedCrit,guaranteedDh:actionOverride?.guaranteedDh??configuredRule.guaranteedDh??listedGuaranteed?.dh??row.guaranteedDh};
      const multipliers=[actionRule.multiplier||1,...buffs.map(buff=>buff.damageMultiplier||1)].filter(value=>value!==1),petProfile=actionRule.petCorrection?findPetCorrectionProfile(job):undefined;
      const mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0);
      const actionMain=petProfile?petMainStat(petProfile,stats.level,mainStat+mainBonus):mainStat+mainBonus,formulaOverrides=petProfile?petFormulaOverrides(petProfile,stats.level):{};
      const base=baseDamage(Math.max(0,row.potency),stats,job,actionMain,"direct",!!actionRule.guaranteedDh,formulaOverrides);
      rowDamage=expectedRoll(base,stats,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);
      for(let i=0;i<iterations;i++)rowSim+=simulatedRoll(base,stats,random,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers);rowSim/=iterations;
      total+=rowDamage;simTotal+=rowSim;sumPotency+=Math.max(0,row.potency);
      const recast=gcdCycleTime(row.recast||stats.gcd,stats,executionHaste);
      if(row.lane==="gcd")nextGcd=Math.max(nextGcd,row.time)+recast;nextOgcd=Math.max(nextOgcd,row.time)+.675;
      const listedDot=findDotAction(job,row.actionId,dotList),dotRule=actionOverride?(actionOverride.dotPotency&&actionOverride.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:actionOverride.dotPotency,duration:actionOverride.dotDuration}:undefined):listedDot?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:listedDot.potency,duration:listedDot.duration,tickInterval:listedDot.tickInterval}:(row.dotPotency&&row.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:row.dotPotency,duration:row.dotDuration}:undefined);
      if(dotRule){const tickInterval=dotRule.tickInterval||3,dotBase=baseDamage(dotRule.potency,stats,job,actionMain,"dot",!!actionRule.guaranteedDh,formulaOverrides),nextTick=(Math.floor(damageEvent/tickInterval)+1)*tickInterval;dots.set(dotRule.key,{...dotRule,sourceName:row.name,nextTick,ends:damageEvent+dotRule.duration,base:dotBase,multipliers,crit:!!actionRule.guaranteedCrit,dh:!!actionRule.guaranteedDh})}
      for(const buff of executionBuffs)if(buff.remainingStacks!==undefined&&buff.haste&&applies(buff,row.actionId))buff.remainingStacks=Math.max(0,buff.remainingStacks-1);
      for(const buff of (config.buffs||[]).filter(rule=>rule.sourceActionId===row.actionId)){const starts=damageEvent+(buff.activationDelay||0);activeBuffs.push({...buff,starts,ends:starts+buff.duration,remainingStacks:buff.stacks})}
    }
    let newAa=0,aaDamage=0,aaSim=0;
    while(damageEvent>=0&&stats.aaInterval>0&&nextAa<=damageEvent){
      const blocked=downtimes.find(item=>nextAa>=item.start&&nextAa<item.end);
      if(blocked){nextAa=blocked.end;continue}
      const tickTime=nextAa,buffs=activeBuffs.filter(buff=>tickTime>=buff.starts&&tickTime<buff.ends&&(buff.remainingStacks===undefined||buff.remainingStacks>0)&&applies(buff,-1));
      const multipliers=buffs.map(buff=>buff.damageMultiplier||1).filter(value=>value!==1),mainBonus=aaUsesMain?buffs.reduce((value,buff)=>value+Math.min(Math.floor(stats.main*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0):0;
      const aaBase=baseDamage(aaPotency,aaFormulaStats,job,aaMain+mainBonus,"auto",false,{jobMod:AA_JOB_MOD[job]||100});aaDamage+=expectedRoll(aaBase,aaFormulaStats,false,false,multipliers);
      for(let i=0;i<iterations;i++)aaSim+=simulatedRoll(aaBase,aaFormulaStats,random,false,false,multipliers)/iterations;
      const aaHaste=buffs.reduce((value,buff)=>Math.max(value,buff.haste||0),config.passiveHaste||0),interval=Math.max(.01,speedAdjustedTime(stats.aaInterval,aaFormulaStats,aaHaste));
      nextAa=addActiveDuration(tickTime,interval,downtimes);aaCount++;newAa++;
    }
    aaTotal+=aaDamage;total+=aaDamage;simTotal+=aaSim;sumPotency+=newAa*aaPotency;
    output.push({...row,prepare,damageEvent,nextGcd,nextOgcd,dps:damageEvent>0?total/damageEvent:0,simulatedDps:damageEvent>0?simTotal/damageEvent:0,sumPotency,aaCount,totalDamage:total,simulatedDamage:simTotal,rowDamage,aaDamage:aaTotal,dotDamage:dotTotal,dotDamageByAction:{...dotBreakdown}});
  }
  return output;
}
