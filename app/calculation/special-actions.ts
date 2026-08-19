export const SPECIAL_ACTION_IDS={
  livingShadow:16472,
  earthlyStar:7439,
  stellarDetonation:8324,
  bunshin:16493,
  automatonQueen:16501,
  queenOverdrive:16502,
  saltedEarth:3639,
  slipstream:25837,
  doton:2270,
  phantomKamaitachi:25774,
} as const;

export const PET_COMMAND_DELAY=.675;

export const SMN_PET_COMMAND_ACTION_IDS=new Set<number>([
  25802,25803,25804, // Ruby, Topaz, Emerald Carbuncle
  25805,25806,25807, // Ifrit, Titan, Garuda
  25838,25839,25840, // Ifrit II, Titan II, Garuda II
  7427,7429,         // Bahamut, Enkindle Bahamut
  25831,16516,       // Phoenix, Enkindle Phoenix
  36992,36998,       // Solar Bahamut, Enkindle Solar Bahamut
]);

export const isSummonerPetCommand=(job:string,actionId:number)=>job==="SMN"&&SMN_PET_COMMAND_ACTION_IDS.has(actionId);
export const isDirectPetCorrectedAction=(job:string,actionId:number)=>(job==="NIN"&&actionId===SPECIAL_ACTION_IDS.phantomKamaitachi)||isSummonerPetCommand(job,actionId);

export type TimedSpecialAttack={offset:number;potency:number;phase?:"punch"|"finisher"};

const LIVING_SHADOW_OFFSETS=[6.8,8.98,11.16,13.34,15.52,17.7];
export function livingShadowAttacks(level:number):TimedSpecialAttack[]{
  if(level<80)return[];
  const filler=level>=90?420:340,shadowbringer=level>=90?570:filler,last=level>=100?620:filler;
  return [filler,0,shadowbringer,filler,filler,last].map((potency,index)=>({offset:LIVING_SHADOW_OFFSETS[index],potency}));
}

export const BUNSHIN={
  stacks:5,duration:30,singlePotency:160,aoePotency:80,
  singleTargetActionIds:[2240,2242,2247,2255,3563,25777,25778],
  aoeActionIds:[2254,16488],
} as const;

export const EARTHLY_STAR={growAfter:10,expiresAfter:20,smallPotency:205,largePotency:310} as const;

export const QUEEN={
  minBattery:50,maxBattery:100,
  initialDelay:5.5,punchInterval:1.56,punches:5,finisherInterval:2,
  armPunch:{min:120,max:240},pileBunker:{min:340,max:680},crownedCollider:{min:390,max:780},
} as const;

export function queenPotency(range:{min:number;max:number},battery:number){
  const gauge=Math.max(QUEEN.minBattery,Math.min(QUEEN.maxBattery,battery));
  return Math.floor(range.min+(range.max-range.min)*(gauge-QUEEN.minBattery)/(QUEEN.maxBattery-QUEEN.minBattery));
}

export function queenAttacks(level:number,battery:number):TimedSpecialAttack[]{
  if(level<80)return[];
  const attacks:TimedSpecialAttack[]=Array.from({length:QUEEN.punches},(_,index)=>({offset:QUEEN.initialDelay+QUEEN.punchInterval*index,potency:queenPotency(QUEEN.armPunch,battery),phase:"punch"}));
  const firstFinisher=QUEEN.initialDelay+QUEEN.punchInterval*QUEEN.punches;
  attacks.push({offset:firstFinisher,potency:queenPotency(QUEEN.pileBunker,battery),phase:"finisher"});
  if(level>=86)attacks.push({offset:firstFinisher+QUEEN.finisherInterval,potency:queenPotency(QUEEN.crownedCollider,battery),phase:"finisher"});
  return attacks;
}

export function bunshinPotency(actionId:number){
  if(BUNSHIN.singleTargetActionIds.some(id=>id===actionId))return BUNSHIN.singlePotency;
  if(BUNSHIN.aoeActionIds.some(id=>id===actionId))return BUNSHIN.aoePotency;
  return 0;
}

const SPECIAL_CONTROL_ACTION_IDS=new Set<number>([
  SPECIAL_ACTION_IDS.livingShadow,
  SPECIAL_ACTION_IDS.earthlyStar,
  SPECIAL_ACTION_IDS.bunshin,
  SPECIAL_ACTION_IDS.automatonQueen,
  SPECIAL_ACTION_IDS.queenOverdrive,
]);

export const isSpecialControlAction=(actionId:number)=>SPECIAL_CONTROL_ACTION_IDS.has(actionId);

export const SPECIAL_REPLACEMENT_ACTIONS:Record<string,{id:number;level:number}[]>={
  AST:[{id:SPECIAL_ACTION_IDS.stellarDetonation,level:62}],
  MCH:[{id:SPECIAL_ACTION_IDS.queenOverdrive,level:80}],
};
