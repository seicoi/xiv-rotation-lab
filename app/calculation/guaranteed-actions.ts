export type GuaranteedAction={job:string;actionId:number;name:string;crit:boolean;dh:boolean};
export const GUARANTEED_ACTIONS:GuaranteedAction[]=[
  {job:"WAR",actionId:16463,name:"カオティックサイクロン",crit:true,dh:true},{job:"WAR",actionId:16465,name:"インナーカオス",crit:true,dh:true},{job:"WAR",actionId:25753,name:"プライマルレンド",crit:true,dh:true},{job:"WAR",actionId:36925,name:"ルイネーター",crit:true,dh:true},
  {job:"MNK",actionId:53,name:"連撃",crit:true,dh:false},{job:"MNK",actionId:25767,name:"壊神脚",crit:true,dh:false},{job:"MNK",actionId:36945,name:"猿舞連撃",crit:true,dh:false},
  {job:"SAM",actionId:7487,name:"乱れ雪月花",crit:true,dh:false},{job:"SAM",actionId:16486,name:"返し雪月花",crit:true,dh:false},{job:"SAM",actionId:25781,name:"奥義波切",crit:true,dh:false},{job:"SAM",actionId:25782,name:"返し波切",crit:true,dh:false},{job:"SAM",actionId:36966,name:"天道雪月花",crit:true,dh:false},{job:"SAM",actionId:36968,name:"天道返し雪月花",crit:true,dh:false},
  {job:"MCH",actionId:36982,name:"フルメタルバースト",crit:true,dh:true},{job:"DNC",actionId:25792,name:"流星の舞い",crit:true,dh:true},
  {job:"PCT",actionId:34678,name:"ハンマースタンプ",crit:true,dh:true},{job:"PCT",actionId:34679,name:"ハンマーブラッシュ",crit:true,dh:true},{job:"PCT",actionId:34680,name:"ハンマーポリッシュ",crit:true,dh:true},
];
export const findGuaranteedAction=(job:string,actionId:number,list:GuaranteedAction[]=GUARANTEED_ACTIONS)=>list.find(item=>item.job===job&&item.actionId===actionId);
