export type DotAction={job:string;actionId:number;name:string;potency:number;duration:number;tickInterval?:number};

// Current PvE DoTs, keyed by stable action ID. API metadata may refresh potency/duration;
// developer overrides are applied after both this list and API data.
export const DOT_ACTIONS:DotAction[]=[
  {job:"PLD",actionId:23,name:"サークル・オブ・ドゥーム",potency:30,duration:15},
  {job:"GNB",actionId:16153,name:"ソニックブレイク",potency:120,duration:15},{job:"GNB",actionId:16159,name:"バウショック",potency:60,duration:15},
  {job:"WHM",actionId:121,name:"エアロ",potency:30,duration:30},{job:"WHM",actionId:132,name:"エアロラ",potency:50,duration:30},{job:"WHM",actionId:16532,name:"ディア",potency:85,duration:30},
  {job:"SCH",actionId:17864,name:"バイオ",potency:20,duration:30},{job:"SCH",actionId:17865,name:"バイオラ",potency:40,duration:30},{job:"SCH",actionId:16540,name:"蠱毒法",potency:85,duration:30},{job:"SCH",actionId:37012,name:"埋伏の毒",potency:140,duration:15},
  {job:"AST",actionId:3599,name:"コンバス",potency:50,duration:30},{job:"AST",actionId:3608,name:"コンバラ",potency:60,duration:30},{job:"AST",actionId:16554,name:"コンバガ",potency:70,duration:30},
  {job:"SGE",actionId:24293,name:"エウクラシア・ドシス",potency:40,duration:30},{job:"SGE",actionId:24308,name:"エウクラシア・ドシスII",potency:60,duration:30},{job:"SGE",actionId:24314,name:"エウクラシア・ドシスIII",potency:90,duration:30},{job:"SGE",actionId:37032,name:"エウクラシア・ディスクラシア",potency:40,duration:30},
  {job:"DRG",actionId:88,name:"桜華狂咲",potency:40,duration:24},{job:"DRG",actionId:25772,name:"桜華繚乱",potency:45,duration:24},{job:"SAM",actionId:7489,name:"彼岸花",potency:50,duration:60},
  {job:"BRD",actionId:100,name:"ベノムバイト",potency:15,duration:45},{job:"BRD",actionId:113,name:"ウィンドバイト",potency:20,duration:45},{job:"BRD",actionId:7406,name:"コースティックバイト",potency:20,duration:45},{job:"BRD",actionId:7407,name:"ストームバイト",potency:25,duration:45},
  {job:"MCH",actionId:16499,name:"バイオブラスト",potency:50,duration:15},
  {job:"BLM",actionId:144,name:"サンダー",potency:45,duration:24},{job:"BLM",actionId:7447,name:"サンダラ",potency:30,duration:18},{job:"BLM",actionId:153,name:"サンダガ",potency:50,duration:27},{job:"BLM",actionId:7420,name:"サンダジャ",potency:35,duration:21},{job:"BLM",actionId:36986,name:"ハイサンダー",potency:60,duration:30},{job:"BLM",actionId:36987,name:"ハイサンダラ",potency:40,duration:24},
];
export const findDotAction=(job:string,actionId:number,list:DotAction[]=DOT_ACTIONS)=>list.find(item=>item.job===job&&item.actionId===actionId);
