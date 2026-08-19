// Allagan Studies based scalar formulas. Keep flooring order explicit: changing the
// order of Math.floor calls changes in-game damage and must be reviewed separately.
export type FormulaStats={level:number;weapon:number;aaInterval:number;main:number;aaMain:number;crit:number;dh:number;det:number;speed:number;tenacity:number};
export type DamageKind="direct"|"auto"|"dot";

export const LEVEL_MODS:Record<number,{main:number;sub:number;div:number;attack:number;tankAttack:number}>={
  70:{main:292,sub:364,div:900,attack:125,tankAttack:105},
  80:{main:340,sub:380,div:1300,attack:165,tankAttack:115},
  90:{main:390,sub:400,div:1900,attack:195,tankAttack:156},
  100:{main:440,sub:420,div:2780,attack:237,tankAttack:190},
};
export const JOB_MOD:Record<string,number>={PLD:100,WAR:105,DRK:105,GNB:100,WHM:115,SCH:115,AST:115,SGE:115,MNK:110,DRG:115,NIN:110,SAM:112,RPR:115,VPR:110,BRD:115,MCH:115,DNC:115,BLM:115,SMN:115,RDM:115,PCT:115};
export const AA_JOB_MOD:Record<string,number>={PLD:100,WAR:105,DRK:105,GNB:100,WHM:55,SCH:90,AST:50,SGE:60,MNK:110,DRG:115,NIN:110,SAM:112,RPR:115,VPR:110,BRD:115,MCH:115,DNC:115,BLM:45,SMN:90,RDM:55,PCT:50};
// Current game data: Attack is 90 potency, Shot (BRD/MCH) is 80 potency.
export const AA_POTENCY:Record<string,number>={BRD:80,MCH:80};
export const autoAttackPotency=(job:string)=>AA_POTENCY[job]||90;
export const TRAIT:Record<string,number>={PLD:100,WAR:100,DRK:100,GNB:100,WHM:130,SCH:130,AST:130,SGE:130,MNK:100,DRG:100,NIN:100,SAM:100,RPR:100,VPR:100,BRD:120,MCH:120,DNC:120,BLM:130,SMN:130,RDM:130,PCT:130};
export const TANKS=new Set(["PLD","WAR","DRK","GNB"]);
export const AA_USES_MAIN=new Set(["PLD","WAR","DRK","GNB","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC"]);

export const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
function factors(stats:FormulaStats,job:string,mainOverride=stats.main,jobModOverride=JOB_MOD[job]||100){
  const mod=LEVEL_MODS[stats.level]||LEVEL_MODS[100],tank=TANKS.has(job),attackCoeff=tank?mod.tankAttack:mod.attack;
  return{mod,fAtk:Math.floor(attackCoeff*(mainOverride-mod.main)/mod.main)+100,fDet:Math.floor(140*(stats.det-mod.main)/mod.div+1000),fTnc:tank?Math.floor(112*(stats.tenacity-mod.sub)/mod.div+1000):1000,fWd:Math.floor(mod.main*jobModOverride/1000)+stats.weapon,fSpd:Math.floor(130*(stats.speed-mod.sub)/mod.div+1000),trait:TRAIT[job]||100};
}
function rates(stats:FormulaStats){const mod=LEVEL_MODS[stats.level]||LEVEL_MODS[100],delta=Math.floor(200*(stats.crit-mod.sub)/mod.div);return{critRate:clamp((delta+50)/1000,0,1),critPower:1400+delta,dhRate:clamp(Math.floor(550*(stats.dh-mod.sub)/mod.div)/1000,0,1)}}

export function baseDamage(potency:number,stats:FormulaStats,job:string,main:number,kind:DamageKind,guaranteedDh=false,jobModOverride?:number){
  const f=factors(stats,job,main,jobModOverride),autoDh=guaranteedDh?Math.floor(140*(stats.dh-f.mod.sub)/f.mod.div):0;
  let value=Math.floor(potency*f.fAtk*(f.fDet+autoDh)/100/1000);
  value=Math.floor(value*f.fTnc/1000);
  if(kind!=="direct")value=Math.floor(value*f.fSpd/1000);
  value=Math.floor(value*(kind==="auto"?Math.floor(f.fWd*(stats.aaInterval/3)):f.fWd)/100);
  // Action Damage / Maim and Mend traits do not apply to auto-attacks.
  value=Math.floor(value*(kind==="auto"?100:f.trait)/100);
  if(kind==="auto")return Math.max(1,value);
  return kind==="dot"?value+1:value;
}

const applyMultipliers=(base:number,multipliers:number[])=>multipliers.reduce((value,multiplier)=>Math.floor(value*multiplier),base);
export function expectedRoll(base:number,stats:FormulaStats,guaranteedCrit=false,guaranteedDh=false,multipliers:number[]=[]){const r=rates(stats),cr=guaranteedCrit?1:r.critRate,dh=guaranteedDh?1:r.dhRate,normal=applyMultipliers(base,multipliers),crit=applyMultipliers(Math.floor(base*r.critPower/1000),multipliers),direct=applyMultipliers(Math.floor(base*125/100),multipliers),both=applyMultipliers(Math.floor(Math.floor(base*r.critPower/1000)*125/100),multipliers);return normal*(1-cr)*(1-dh)+crit*cr*(1-dh)+direct*(1-cr)*dh+both*cr*dh}
export function simulatedRoll(base:number,stats:FormulaStats,random:()=>number,guaranteedCrit=false,guaranteedDh=false,multipliers:number[]=[]){if(base<=1)return applyMultipliers(1,multipliers);const r=rates(stats);let value=base;if(guaranteedCrit||random()<r.critRate)value=Math.floor(value*r.critPower/1000);if(guaranteedDh||random()<r.dhRate)value=Math.floor(value*125/100);value=Math.floor(value*(950+Math.floor(random()*101))/1000);return applyMultipliers(value,multipliers)}
export function simulatedDotRoll(base:number,stats:FormulaStats,random:()=>number,guaranteedCrit=false,guaranteedDh=false,multipliers:number[]=[]){const r=rates(stats);let value=Math.floor(base*(950+Math.floor(random()*101))/1000);if(guaranteedCrit||random()<r.critRate)value=Math.floor(value*r.critPower/1000);if(guaranteedDh||random()<r.dhRate)value=Math.floor(value*125/100);return applyMultipliers(value,multipliers)}
// The tier table is the result of these integer floors; no precomputed SS table is required.
export function speedAdjustedTime(seconds:number,stats:FormulaStats,haste=0){const mod=LEVEL_MODS[stats.level]||LEVEL_MODS[100],milliseconds=Math.round(Math.max(0,seconds)*1000),speedTerm=1000+Math.ceil(130*(mod.sub-stats.speed)/mod.div),speedMilliseconds=Math.floor(milliseconds*speedTerm/1000),hasteMilliseconds=Math.floor(speedMilliseconds*(100-clamp(haste,0,99))/100);return Math.floor(hasteMilliseconds/10)/100}
export function gcdCycleTime(seconds:number,stats:FormulaStats,haste=0){return Math.round((speedAdjustedTime(seconds,stats,haste)+.005)*1000)/1000}
