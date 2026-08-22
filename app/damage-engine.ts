import {AA_JOB_MOD,AA_USES_MAIN,autoAttackPotency,baseDamage,clamp,expectedRoll,fullPartyMainStat,gcdCycleTime,simulatedDotRoll,simulatedRoll,speedAdjustedTime,type RollRateBonuses} from "./calculation/damage-formula";
import {DOT_ACTIONS,findDotAction,type DotAction} from "./calculation/dot-actions";
import {GUARANTEED_ACTIONS,findGuaranteedAction,type GuaranteedAction} from "./calculation/guaranteed-actions";
import {JOB_CONFIGS,type ActionRule,type BuffRule,type JobConfig} from "./calculation/job-configs";
import {canApplyPetDamageCorrection,findPetCorrectionProfile,petFormulaOverrides,petMainStat} from "./calculation/pet-configs";
import {BUNSHIN,EARTHLY_STAR,PET_COMMAND_DELAY,QUEEN,SPECIAL_ACTION_IDS,bunshinPotency,isDirectPetCorrectedAction,isSpecialControlAction,isSummonerPetCommand,livingShadowAttacks,queenAttacks,queenPotency} from "./calculation/special-actions";
import {advanceBlackMageState,blackMageDamageMultipliers,initialBlackMageState} from "./calculation/black-mage-config";

export type EngineStats = {
  level:number; weapon:number; aaInterval:number; aaSpeed:number; main:number; aaMain:number;
  crit:number; dh:number; det:number; speed:number; tenacity:number; gcd:number;
  potionPercent:number; potionCap:number; simulationIterations:number;
};

export type EngineRow = {
  id:string; time:number; actionId:number|null; name:string; lane:"gcd"|"ability";
  potency:number; comboPotency?:number; comboFromActionId?:number; preservesCombo?:boolean; aspectId?:number; attackTypeId?:number; attackType?:string; targetSelf?:boolean; cast:number; recast:number; gcdRecast?:number; modifier:"none"|"delay"|"downtime"|"pre"|"potion";
  modifierValue:number; specialValue?:number;
  dotPotency?:number; dotDuration?:number; guaranteedCrit?:boolean; guaranteedDh?:boolean;
};

export type DotRule = { sourceActionId:number; key:string; potency:number; duration:number; tickInterval?:number; initialTick?:boolean };
export type ActionDataOverride={actionId:number;potency?:number;dotPotency?:number;dotDuration?:number;recast?:number;cast?:number;lane?:"gcd"|"ability";guaranteedCrit?:boolean;guaranteedDh?:boolean;evolve?:boolean};
export type DeveloperCalculationOverrides={dots?:DotAction[];guaranteed?:GuaranteedAction[];jobs?:Record<string,JobConfig>;actions?:Record<string,ActionDataOverride[]>};
export type DamageCalculationOptions={simulate?:boolean};
export type {ActionRule,BuffRule,JobConfig};

export type EngineComputedRow<T extends EngineRow = EngineRow> = T & {
  effectiveCast:number; prepare:number; damageEvent:number; nextGcd:number; nextOgcd:number; dps:number; simulatedDps:number;
  sumPotency:number; aaCount:number; totalDamage:number; simulatedDamage:number; rowDamage:number;
  aaDamage:number; dotDamage:number; dotDamageByAction:Record<string,number>;
  specialDamage:number; specialDamageByAction:Record<string,number>;
  simulation?:SimulationDistribution;
};
export type SimulationDistribution={minimum:number;maximum:number;median:number;mean:number;samples:number[]};

type ActiveBuff = BuffRule & { starts:number; ends:number; remainingStacks?:number };
type DotInstance = DotRule & { sourceName:string; nextTick:number; ends:number; base:number; multipliers:number[]; rateBonuses:RollRateBonuses; crit:boolean; dh:boolean };
type Downtime = { start:number; end:number };
type ScheduledSpecial={id:string;group:string;time:number;potency:number;sourceName:string;actionId:number;phase?:"punch"|"finisher"};
export const ANIMATION_LOCK=.625;

const applies=(buff:BuffRule,actionId:number|null,attackTypeId=0,lane:"gcd"|"ability"|"auto"="ability")=>actionId!==null&&(!buff.include||buff.include.includes(actionId))&&(!buff.exclude||!buff.exclude.includes(actionId))&&(!buff.lanes||buff.lanes.includes(lane))&&(!buff.attackTypeIds||buff.attackTypeIds.includes(attackTypeId));
const buffRateBonuses=(buffs:BuffRule[]):RollRateBonuses=>({critRate:buffs.reduce((sum,buff)=>sum+(buff.critRateBonus||0),0),dhRate:buffs.reduce((sum,buff)=>sum+(buff.dhRateBonus||0),0)});
const targetable=(time:number,downtimes:Downtime[])=>!downtimes.some(item=>time>=item.start&&time<item.end);
function addActiveDuration(start:number,duration:number,downtimes:Downtime[]){let cursor=start,remaining=Math.max(0,duration);for(const item of downtimes.slice().sort((a,b)=>a.start-b.start)){if(item.end<=cursor)continue;if(item.start>=cursor+remaining)break;if(item.start>cursor){remaining-=item.start-cursor;cursor=item.start}cursor=Math.max(cursor,item.end)}return cursor+remaining}
function mergeDowntimes(items:Downtime[]){const merged:Downtime[]=[];for(const item of items.filter(value=>value.end>value.start).sort((a,b)=>a.start-b.start)){const previous=merged.at(-1);if(previous&&item.start<=previous.end)previous.end=Math.max(previous.end,item.end);else merged.push({...item})}return merged}
function measuredDuration(until:number,downtimes:Downtime[]){const end=Math.max(0,until);let excluded=0;for(const item of downtimes){if(item.start>=end)break;excluded+=Math.max(0,Math.min(end,item.end)-Math.max(0,item.start))}return Math.max(0,end-excluded)}

function hashSeed(rows:EngineRow[],stats:EngineStats,job:string){
  const source=`${job}|${JSON.stringify(stats)}|${rows.map(row=>`${row.actionId}:${row.time}:${row.potency}:${row.specialValue??""}`).join("|")}`;
  let hash=2166136261;for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}return hash>>>0||1;
}
function rng(seed:number){let state=seed>>>0;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296}}
export {speedAdjustedTime};
export function calculateDamage<T extends EngineRow>(rows:T[],stats:EngineStats,job:string,overrides:DeveloperCalculationOverrides={},options:DamageCalculationOptions={}):EngineComputedRow<T>[] {
  const config=(overrides.jobs||JOB_CONFIGS)[job]||{buffs:[],actions:{}},dotList=overrides.dots||DOT_ACTIONS,guaranteedList=overrides.guaranteed||GUARANTEED_ACTIONS,iterations=clamp(Math.round(stats.simulationIterations||1000),1,10000),simulate=options.simulate!==false,mainStat=fullPartyMainStat(stats.main),aaUsesMain=AA_USES_MAIN.has(job),aaMain=fullPartyMainStat(aaUsesMain?stats.main:stats.aaMain),aaPotency=autoAttackPotency(job),aaFormulaStats={...stats,main:mainStat,aaMain,speed:stats.aaSpeed};
  const downtimes=mergeDowntimes(rows.filter(row=>row.modifier==="downtime").map(row=>({start:row.time,end:row.time+Math.max(0,row.modifierValue)})));
  const random=rng(hashSeed(rows,stats,job)),simulationTotals=simulate?new Float64Array(iterations):null;
  const directSimulation=(base:number,formulaStats:EngineStats,crit:boolean,dh:boolean,multipliers:number[],rateBonuses:RollRateBonuses={})=>{if(!simulationTotals)return expectedRoll(base,formulaStats,crit,dh,multipliers,rateBonuses);let sampled=0;for(let i=0;i<iterations;i++){const value=simulatedRoll(base,formulaStats,random,crit,dh,multipliers,rateBonuses);simulationTotals[i]+=value;sampled+=value}return sampled/iterations};
  const dotSimulation=(base:number,formulaStats:EngineStats,crit:boolean,dh:boolean,multipliers:number[],rateBonuses:RollRateBonuses={})=>{if(!simulationTotals)return expectedRoll(base,formulaStats,crit,dh,multipliers,rateBonuses);let sampled=0;for(let i=0;i<iterations;i++){const value=simulatedDotRoll(base,formulaStats,random,crit,dh,multipliers,rateBonuses);simulationTotals[i]+=value;sampled+=value}return sampled/iterations};
  let nextGcd=0,nextOgcd=0,nextAa=0,aaCount=0,sumPotency=0,total=0,simTotal=0,aaTotal=0,dotTotal=0,specialTotal=0,comboActionId:number|null=null,comboExpires=-Infinity;
  const activeBuffs:ActiveBuff[]=[],dots=new Map<string,DotInstance>(),dotBreakdown:Record<string,number>={},specialBreakdown:Record<string,number>={},scheduled:ScheduledSpecial[]=[];const output:EngineComputedRow<T>[]=[];
  let bunshinState:{ends:number;stacks:number;sourceName:string}|undefined,starState:{placedAt:number;group:string;sourceName:string}|undefined,queenState:{group:string;battery:number;sourceName:string}|undefined,blackMageState=initialBlackMageState();
  const resolveScheduled=(until:number)=>{
    let expected=0,simulated=0,potency=0;scheduled.sort((a,b)=>a.time-b.time);
    while(scheduled.length&&scheduled[0].time<=until){
      const event=scheduled.shift()!;if(!targetable(event.time,downtimes))continue;
      const buffs=activeBuffs.filter(buff=>event.time>=buff.starts&&event.time<buff.ends&&applies(buff,event.actionId,0,"ability")),multipliers=buffs.map(buff=>buff.damageMultiplier||1).filter(value=>value!==1),rateBonuses=buffRateBonuses(buffs);
      const mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(mainStat*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0),profile=findPetCorrectionProfile(job);
      const actionMain=profile?petMainStat(profile,stats.level,mainStat+mainBonus):mainStat+mainBonus,formulaOverrides=profile?petFormulaOverrides(profile,stats.level):{};
      const base=baseDamage(event.potency,stats,job,actionMain,"direct",false,formulaOverrides),eventExpected=expectedRoll(base,stats,false,false,multipliers,rateBonuses),eventSim=directSimulation(base,stats,false,false,multipliers,rateBonuses);
      expected+=eventExpected;simulated+=eventSim;potency+=event.potency;specialBreakdown[event.sourceName]=(specialBreakdown[event.sourceName]||0)+eventExpected;
    }
    return{expected,simulated,potency};
  };
  for(const row of rows){
    const executionBuffs=row.actionId===null?[]:activeBuffs.filter(buff=>row.time>=buff.starts&&row.time<buff.ends&&(buff.remainingStacks===undefined||buff.remainingStacks>0)&&applies(buff,row.actionId,row.attackTypeId,row.lane));
    const executionHaste=executionBuffs.reduce((value,buff)=>Math.max(value,buff.haste||0),config.passiveHaste||0);
    const castTime=executionBuffs.reduce((value,buff)=>buff.castOverride===undefined?value:Math.min(value,Math.max(0,buff.castOverride)),Math.max(0,row.cast||0));
    const adjustedCast=speedAdjustedTime(castTime,stats,executionHaste),actionReady=row.actionId===null?row.time:row.time+adjustedCast;
    const ogcdUnlock=Math.round((row.time+(adjustedCast>0?adjustedCast*.8:0)+ANIMATION_LOCK)*1000)/1000;
    const prepare=row.actionId!==null&&isSummonerPetCommand(job,row.actionId)?actionReady+PET_COMMAND_DELAY:actionReady;
    const damageEvent=row.modifier==="delay"||row.modifier==="downtime"?row.time+Math.max(0,row.modifierValue):actionReady;
    const detonatedStar=row.actionId===SPECIAL_ACTION_IDS.stellarDetonation?starState:undefined;
    if(detonatedStar){for(let index=scheduled.length-1;index>=0;index--)if(scheduled[index].group===detonatedStar.group)scheduled.splice(index,1);starState=undefined}
    if(row.actionId===SPECIAL_ACTION_IDS.queenOverdrive&&queenState){
      const pendingPunches=scheduled.filter(event=>event.group===queenState!.group&&event.phase==="punch"&&event.time>=damageEvent);
      if(pendingPunches.length){const finisherAt=Math.max(damageEvent,Math.min(...pendingPunches.map(event=>event.time)));for(let index=scheduled.length-1;index>=0;index--)if(scheduled[index].group===queenState.group&&scheduled[index].time>=damageEvent)scheduled.splice(index,1);scheduled.push({id:`${queenState.group}:pile`,group:queenState.group,time:finisherAt,potency:queenPotency(QUEEN.pileBunker,queenState.battery),sourceName:queenState.sourceName,actionId:SPECIAL_ACTION_IDS.automatonQueen,phase:"finisher"});if(stats.level>=86)scheduled.push({id:`${queenState.group}:collider`,group:queenState.group,time:finisherAt+QUEEN.finisherInterval,potency:queenPotency(QUEEN.crownedCollider,queenState.battery),sourceName:queenState.sourceName,actionId:SPECIAL_ACTION_IDS.automatonQueen,phase:"finisher"})}
    }
    const specialResult=resolveScheduled(damageEvent);specialTotal+=specialResult.expected;total+=specialResult.expected;simTotal+=specialResult.simulated;sumPotency+=specialResult.potency;
    let rowDotDamage=0,rowDotSim=0,rowDotPotency=0;
      for(const [key,dot] of dots){while(dot.nextTick<=damageEvent&&dot.nextTick<=dot.ends){if(targetable(dot.nextTick,downtimes)){const expected=expectedRoll(dot.base,stats,dot.crit,dot.dh,dot.multipliers,dot.rateBonuses);rowDotDamage+=expected;rowDotPotency+=dot.potency;dotBreakdown[dot.sourceName]=(dotBreakdown[dot.sourceName]||0)+expected;rowDotSim+=dotSimulation(dot.base,stats,dot.crit,dot.dh,dot.multipliers,dot.rateBonuses)}dot.nextTick+=(dot.tickInterval||3)}if(dot.nextTick>dot.ends)dots.delete(key)}
    dotTotal+=rowDotDamage;total+=rowDotDamage;simTotal+=rowDotSim;sumPotency+=rowDotPotency;
    const comboSucceeded=row.actionId!==null&&!!row.comboFromActionId&&row.comboFromActionId===comboActionId&&actionReady<=comboExpires;
    let rowDamage=0,rowSim=0,effectivePotency=comboSucceeded&&row.comboPotency?row.comboPotency:row.potency;
    if(row.modifier==="delay"||row.modifier==="downtime"){
      nextGcd=Math.max(nextGcd,row.time)+Math.max(0,row.modifierValue);nextOgcd=Math.max(nextOgcd,row.time)+Math.max(0,row.modifierValue);
    }else if(row.modifier==="potion"){
      activeBuffs.push({sourceActionId:-1,duration:30,mainStatPercent:Math.max(0,stats.potionPercent)/100,mainStatCap:Math.max(0,stats.potionCap),starts:row.time,ends:row.time+30});
      nextOgcd=Math.max(nextOgcd,row.time+ANIMATION_LOCK);
    }else if(row.actionId!==null){
      if(row.actionId===SPECIAL_ACTION_IDS.stellarDetonation)effectivePotency=detonatedStar?(damageEvent-detonatedStar.placedAt>=EARTHLY_STAR.growAfter?EARTHLY_STAR.largePotency:EARTHLY_STAR.smallPotency):0;
      else if(isSpecialControlAction(row.actionId))effectivePotency=0;
      const buffs=activeBuffs.filter(buff=>prepare>=buff.starts&&prepare<buff.ends&&applies(buff,row.actionId,row.attackTypeId,row.lane));
      const potencyOverrides=buffs.map(buff=>buff.potencyOverride).filter((value):value is number=>value!==undefined);if(potencyOverrides.length)effectivePotency=Math.max(effectivePotency,...potencyOverrides);
      const actionOverride=overrides.actions?.[job]?.find(item=>item.actionId===row.actionId),configuredRule=(config.actions||{})[row.actionId]||{},listedGuaranteed=findGuaranteedAction(job,row.actionId,guaranteedList),baseGuaranteedCrit=actionOverride?.guaranteedCrit??configuredRule.guaranteedCrit??listedGuaranteed?.crit??row.guaranteedCrit,baseGuaranteedDh=actionOverride?.guaranteedDh??configuredRule.guaranteedDh??listedGuaranteed?.dh??row.guaranteedDh,actionRule={...configuredRule,guaranteedCrit:baseGuaranteedCrit||buffs.some(buff=>buff.guaranteedCrit),guaranteedDh:baseGuaranteedDh||buffs.some(buff=>buff.guaranteedDh)};
      const jobMultipliers=job==="BLM"?blackMageDamageMultipliers(blackMageState,prepare,stats.level,row.aspectId||0,row.attackTypeId||0):[],multipliers=[actionRule.multiplier||1,...buffs.map(buff=>buff.damageMultiplier||1),...jobMultipliers].filter(value=>value!==1),rateBonuses=buffRateBonuses(buffs),usesPetFormula=!!detonatedStar||isDirectPetCorrectedAction(job,row.actionId),candidatePetProfile=usesPetFormula?findPetCorrectionProfile(job):undefined,petProfile=canApplyPetDamageCorrection(candidatePetProfile,row.actionId)?candidatePetProfile:undefined;
      const mainBonus=buffs.reduce((value,buff)=>value+Math.min(Math.floor(mainStat*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0);
      const actionMain=petProfile?petMainStat(petProfile,stats.level,mainStat+mainBonus):mainStat+mainBonus,formulaOverrides=petProfile?petFormulaOverrides(petProfile,stats.level):{};
      const base=baseDamage(Math.max(0,effectivePotency),stats,job,actionMain,"direct",!!actionRule.guaranteedDh,formulaOverrides);
      rowDamage=expectedRoll(base,stats,actionRule.guaranteedCrit,actionRule.guaranteedDh,multipliers,rateBonuses);
      rowSim=directSimulation(base,stats,!!actionRule.guaranteedCrit,!!actionRule.guaranteedDh,multipliers,rateBonuses);
      const echoPotency=bunshinState&&damageEvent<bunshinState.ends&&bunshinState.stacks>0?bunshinPotency(row.actionId):0;
      if(echoPotency>0){const profile=findPetCorrectionProfile("NIN")!,echoMain=petMainStat(profile,stats.level,mainStat+mainBonus),echoBase=baseDamage(echoPotency,stats,job,echoMain,"direct",false,petFormulaOverrides(profile,stats.level)),echoExpected=expectedRoll(echoBase,stats,false,false,multipliers,rateBonuses),echoSim=directSimulation(echoBase,stats,false,false,multipliers,rateBonuses);specialTotal+=echoExpected;total+=echoExpected;simTotal+=echoSim;sumPotency+=echoPotency;specialBreakdown[bunshinState.sourceName]=(specialBreakdown[bunshinState.sourceName]||0)+echoExpected;bunshinState.stacks--}
      total+=rowDamage;simTotal+=rowSim;sumPotency+=Math.max(0,effectivePotency);
      const recast=gcdCycleTime(row.gcdRecast||stats.gcd,stats,executionHaste);
      if(row.lane==="gcd")nextGcd=Math.max(nextGcd,row.time)+recast;nextOgcd=Math.max(nextOgcd,ogcdUnlock);
      const listedDot=findDotAction(job,row.actionId,dotList),dotRule=actionOverride?(actionOverride.dotPotency&&actionOverride.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:actionOverride.dotPotency,duration:actionOverride.dotDuration}:undefined):listedDot?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:listedDot.potency,duration:listedDot.duration,tickInterval:listedDot.tickInterval,initialTick:listedDot.initialTick}:(row.dotPotency&&row.dotDuration?{sourceActionId:row.actionId,key:`action:${row.actionId}`,potency:row.dotPotency,duration:row.dotDuration}:undefined);
      if(dotRule){const dotGuaranteedCrit=!!baseGuaranteedCrit||buffs.some(buff=>buff.guaranteedCrit&&buff.guaranteesDot),dotGuaranteedDh=!!baseGuaranteedDh||buffs.some(buff=>buff.guaranteedDh&&buff.guaranteesDot),tickInterval=dotRule.tickInterval||3,dotBase=baseDamage(dotRule.potency,stats,job,actionMain,"dot",dotGuaranteedDh,formulaOverrides),nextTick=(Math.floor(damageEvent/tickInterval)+1)*tickInterval;dots.set(dotRule.key,{...dotRule,sourceName:row.name,nextTick,ends:damageEvent+dotRule.duration,base:dotBase,multipliers,rateBonuses,crit:dotGuaranteedCrit,dh:dotGuaranteedDh});if(dotRule.initialTick&&targetable(damageEvent,downtimes)){const initialExpected=expectedRoll(dotBase,stats,dotGuaranteedCrit,dotGuaranteedDh,multipliers,rateBonuses),initialSim=dotSimulation(dotBase,stats,dotGuaranteedCrit,dotGuaranteedDh,multipliers,rateBonuses);rowDotDamage+=initialExpected;rowDotSim+=initialSim;rowDotPotency+=dotRule.potency;dotTotal+=initialExpected;total+=initialExpected;simTotal+=initialSim;sumPotency+=dotRule.potency;dotBreakdown[row.name]=(dotBreakdown[row.name]||0)+initialExpected}}
      if(row.actionId===SPECIAL_ACTION_IDS.livingShadow){const group=`living-shadow:${row.id}`;for(const [index,attack] of livingShadowAttacks(stats.level).entries())if(attack.potency>0)scheduled.push({id:`${group}:${index}`,group,time:damageEvent+attack.offset,potency:attack.potency,sourceName:row.name,actionId:row.actionId})}
      if(row.actionId===SPECIAL_ACTION_IDS.earthlyStar){const group=`earthly-star:${row.id}`;starState={placedAt:damageEvent,group,sourceName:row.name};scheduled.push({id:`${group}:auto`,group,time:damageEvent+EARTHLY_STAR.expiresAfter,potency:EARTHLY_STAR.largePotency,sourceName:row.name,actionId:row.actionId})}
      if(row.actionId===SPECIAL_ACTION_IDS.bunshin)bunshinState={ends:damageEvent+BUNSHIN.duration,stacks:BUNSHIN.stacks,sourceName:row.name};
      if(row.actionId===SPECIAL_ACTION_IDS.automatonQueen){const battery=clamp(Math.round(row.specialValue??100),QUEEN.minBattery,QUEEN.maxBattery),group=`queen:${row.id}`;queenState={group,battery,sourceName:row.name};for(const [index,attack] of queenAttacks(stats.level,battery).entries())scheduled.push({id:`${group}:${index}`,group,time:damageEvent+attack.offset,potency:attack.potency,sourceName:row.name,actionId:row.actionId,phase:attack.phase})}
      for(const buff of executionBuffs)if(buff.remainingStacks!==undefined&&(buff.haste||(buff.consumeOnUse&&effectivePotency>0))&&applies(buff,row.actionId,row.attackTypeId,row.lane))buff.remainingStacks=Math.max(0,buff.remainingStacks-1);
      for(const buff of (config.buffs||[]).filter(rule=>rule.sourceActionId===row.actionId&&(!rule.requiresCombo||comboSucceeded)&&(!rule.requiresSelfTarget||row.targetSelf===true))){const starts=damageEvent+(buff.activationDelay||0);if(buff.extendExistingKey){const target=activeBuffs.find(item=>item.key===buff.extendExistingKey&&starts>=item.starts&&starts<item.ends);if(target)target.ends=Math.min(starts+(buff.maxDuration||Infinity),target.ends+(buff.extendBy||0));continue}const key=buff.key||`action:${buff.sourceActionId}`,existing=activeBuffs.find(item=>(item.key||`action:${item.sourceActionId}`)===key);if(existing){existing.starts=starts;existing.ends=buff.extendDuration?Math.min(starts+(buff.maxDuration||buff.duration),Math.max(existing.ends,starts)+buff.duration):starts+buff.duration;existing.remainingStacks=buff.stacks}else activeBuffs.push({...buff,key,starts,ends:starts+buff.duration,remainingStacks:buff.stacks})}
      if(job==="BLM")blackMageState=advanceBlackMageState(blackMageState,row.actionId,actionReady);
      if(row.lane==="gcd"){if(comboSucceeded){comboActionId=row.actionId;comboExpires=actionReady+30}else if(!row.preservesCombo){if(row.comboFromActionId){comboActionId=null;comboExpires=-Infinity}else{comboActionId=row.actionId;comboExpires=actionReady+30}}}
    }
    let aaDamage=0,aaSim=0;
    while(damageEvent>=0&&stats.aaInterval>0&&nextAa<=damageEvent){
      const blocked=downtimes.find(item=>nextAa>=item.start&&nextAa<item.end);
      if(blocked){nextAa=blocked.end;continue}
      const tickTime=nextAa,buffs=activeBuffs.filter(buff=>tickTime>=buff.starts&&tickTime<buff.ends&&(buff.remainingStacks===undefined||buff.remainingStacks>0)&&applies(buff,-1,0,"auto"));
      const multipliers=buffs.map(buff=>buff.damageMultiplier||1).filter(value=>value!==1),rateBonuses=buffRateBonuses(buffs),mainBonus=aaUsesMain?buffs.reduce((value,buff)=>value+Math.min(Math.floor(mainStat*(buff.mainStatPercent||0)),buff.mainStatCap??Infinity),0):0;
      const aaBase=baseDamage(aaPotency,aaFormulaStats,job,aaMain+mainBonus,"auto",false,{jobMod:AA_JOB_MOD[job]||100});aaDamage+=expectedRoll(aaBase,aaFormulaStats,false,false,multipliers,rateBonuses);
      aaSim+=directSimulation(aaBase,aaFormulaStats,false,false,multipliers,rateBonuses);
      const aaHaste=buffs.reduce((value,buff)=>Math.max(value,buff.haste||0),config.passiveHaste||0),interval=Math.max(.01,speedAdjustedTime(stats.aaInterval,aaFormulaStats,aaHaste));
      nextAa=addActiveDuration(tickTime,interval,downtimes);aaCount++;
    }
    aaTotal+=aaDamage;total+=aaDamage;simTotal+=aaSim;
    const measurementTime=measuredDuration(damageEvent,downtimes);
    output.push({...row,potency:effectivePotency,effectiveCast:castTime,prepare,damageEvent,nextGcd,nextOgcd,dps:measurementTime>0?total/measurementTime:0,simulatedDps:measurementTime>0?simTotal/measurementTime:0,sumPotency,aaCount,totalDamage:total,simulatedDamage:simTotal,rowDamage,aaDamage:aaTotal,dotDamage:dotTotal,dotDamageByAction:{...dotBreakdown},specialDamage:specialTotal,specialDamageByAction:{...specialBreakdown}});
  }
  const final=output.at(-1);
  if(final&&simulationTotals){const duration=measuredDuration(final.damageEvent,downtimes),samples=Array.from(simulationTotals,value=>duration>0?value/duration:0).sort((a,b)=>a-b),middle=Math.floor(samples.length/2),median=samples.length%2?samples[middle]:(samples[middle-1]+samples[middle])/2;final.simulation={minimum:samples[0]||0,maximum:samples.at(-1)||0,median,mean:samples.reduce((sum,value)=>sum+value,0)/samples.length,samples}}
  return output;
}
