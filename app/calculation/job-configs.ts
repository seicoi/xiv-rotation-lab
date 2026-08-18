export type BuffRule={sourceActionId:number;duration:number;activationDelay?:number;damageMultiplier?:number;haste?:number;mainStatPercent?:number;mainStatCap?:number;include?:number[];exclude?:number[]};
export type ActionRule={guaranteedCrit?:boolean;guaranteedDh?:boolean;multiplier?:number};
export type JobConfig={buffs:BuffRule[];actions:Record<number,ActionRule>};
const JOBS=["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"];
export const JOB_CONFIGS:Record<string,JobConfig>=Object.fromEntries(JOBS.map(job=>[job,{buffs:[],actions:{}}]));
JOB_CONFIGS.PLD.buffs.push({sourceActionId:20,duration:20,damageMultiplier:1.25});
