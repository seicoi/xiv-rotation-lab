export type BuffRule={sourceActionId:number;duration:number;activationDelay?:number;damageMultiplier?:number;haste?:number;stacks?:number;mainStatPercent?:number;mainStatCap?:number;include?:number[];exclude?:number[]};
export type ActionRule={guaranteedCrit?:boolean;guaranteedDh?:boolean;multiplier?:number};
export type JobConfig={buffs:BuffRule[];actions:Record<number,ActionRule>;passiveHaste?:number};
const JOBS=["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];
export const JOB_CONFIGS:Record<string,JobConfig>=Object.fromEntries(JOBS.map(job=>[job,{buffs:[],actions:{}}]));
JOB_CONFIGS.PLD.buffs.push({sourceActionId:20,duration:20,damageMultiplier:1.25});
JOB_CONFIGS.WHM.buffs.push({sourceActionId:136,duration:15,haste:20});
JOB_CONFIGS.MNK.passiveHaste=20;
JOB_CONFIGS.NIN.passiveHaste=15;
JOB_CONFIGS.SAM.buffs.push(
  {sourceActionId:7479,duration:40,haste:13},
  {sourceActionId:7485,duration:40,haste:13},
);
JOB_CONFIGS.VPR.buffs.push(
  {sourceActionId:34609,duration:40,haste:15},
  {sourceActionId:34617,duration:40,haste:15},
  {sourceActionId:34622,duration:40,haste:15},
  {sourceActionId:34625,duration:40,haste:15},
);
JOB_CONFIGS.BLM.buffs.push({sourceActionId:3573,duration:20,haste:15});
JOB_CONFIGS.PCT.buffs.push({
  sourceActionId:34675,duration:30,haste:25,stacks:5,
  include:[34650,34651,34652,34653,34654,34655,34656,34657,34658,34659,34660,34661,34681,34682],
});
