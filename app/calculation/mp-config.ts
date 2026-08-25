export type MpActionRule={
  restore?:number;
  restorePercent?:number;
  fullRestore?:boolean;
  requiresCombo?:boolean;
  grantsDarkArts?:boolean;
};

export type MpEffectRule={
  sourceActionId:number;
  key:string;
  duration:number;
  stacks?:number;
  restoreOnUse?:number;
  tickAmount?:number;
  tickInterval?:number;
  nullifyCost?:boolean;
  lanes?:Array<"gcd"|"ability">;
  include?:number[];
};

export type MpResourceConfig={actions:Record<number,MpActionRule>;effects:MpEffectRule[]};

const empty=():MpResourceConfig=>({actions:{},effects:[]});
const JOBS=["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];
export const MP_RESOURCE_CONFIGS:Record<string,MpResourceConfig>=Object.fromEntries(JOBS.map(job=>[job,empty()]));

// Flat restoration values omitted from the in-game action text are cross-checked
// against current job simulations. Percentage values use the fixed 10,000 maximum MP.
MP_RESOURCE_CONFIGS.PLD.actions={
  15:{restore:1000,requiresCombo:true},
  16457:{restore:500,requiresCombo:true},
  16460:{restore:400},36918:{restore:400},36919:{restore:400},
  29:{restore:500},25747:{restore:500},
};

MP_RESOURCE_CONFIGS.DRK.actions={
  3623:{restore:600,requiresCombo:true},16468:{restore:600,requiresCombo:true},
  3641:{restore:600},3643:{restore:600},7393:{grantsDarkArts:true},
};
MP_RESOURCE_CONFIGS.DRK.effects=[
  {sourceActionId:3625,key:"blood-weapon-mp",duration:15,stacks:3,restoreOnUse:600,lanes:["gcd"]},
  {sourceActionId:7390,key:"blood-weapon-mp",duration:15,stacks:3,restoreOnUse:600,lanes:["gcd"]},
  {sourceActionId:7390,key:"delirium-mp",duration:15,stacks:3,restoreOnUse:200,include:[3542,3639,36928,36929,36930,36931]},
];

MP_RESOURCE_CONFIGS.WHM.actions={3571:{restorePercent:5}};
MP_RESOURCE_CONFIGS.WHM.effects=[
  {sourceActionId:7430,key:"thin-air",duration:12,stacks:1,nullifyCost:true},
];

MP_RESOURCE_CONFIGS.SCH.actions={166:{restorePercent:20}};
MP_RESOURCE_CONFIGS.SCH.effects=[
  {sourceActionId:16542,key:"recitation",duration:15,stacks:1,nullifyCost:true,include:[185,186,189,7434,7435,16541,37013]},
];

MP_RESOURCE_CONFIGS.AST.actions={37017:{restorePercent:20},37018:{restorePercent:20}};
MP_RESOURCE_CONFIGS.SGE.actions={
  24296:{restorePercent:7},24298:{restorePercent:7},24299:{restorePercent:7},24303:{restorePercent:7},
};

export const COMMON_MP_EFFECTS:MpEffectRule[]=[
  {sourceActionId:7562,key:"lucid-dreaming",duration:21,tickAmount:550,tickInterval:3},
];

export const DARK_ARTS_SPENDERS=new Set([16466,16467,16469,16470]);

export function adjustedActionMpCost(job:string,level:number,baseCost:number){
  // Divine Magic Mastery halves every PLD spell cost from level 64 onward.
  return job==="PLD"&&level>=64?Math.floor(Math.max(0,baseCost)/2):Math.max(0,baseCost);
}
