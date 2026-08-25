export type GaugeEffect={key:string;add?:number;spend?:number;set?:number;requiresCombo?:boolean};
export type GaugeValue={key:string;nameJa:string;nameEn:string;value:number;maximum:number};
type GaugeDefinition={key:string;nameJa:string;nameEn:string;aliases:string[];maximum:number;timeInterval?:number;timeGain?:number;aaGain?:number;stack?:boolean};
type GaugeRow={time:number;actionId:number|null;lane:"gcd"|"ability";comboFromActionId?:number;preservesCombo?:boolean;gaugeEffects?:GaugeEffect[];specialValue?:number};

const gauge=(key:string,nameJa:string,nameEn:string,maximum:number,aliases:string[],extra:Partial<GaugeDefinition>={}):GaugeDefinition=>({key,nameJa,nameEn,maximum,aliases,...extra});
export const JOB_GAUGES:Record<string,GaugeDefinition[]>={
  PLD:[gauge("oath","オウス","Oath",100,["オウス"],{aaGain:5})],
  WAR:[gauge("beast","インナービースト","Beast",100,["インナービースト"])],
  DRK:[gauge("blood","ブラックブラッド","Blood",100,["ブラックブラッド"])],
  GNB:[gauge("cartridge","ソイル","Cartridge",3,["ソイル"],{stack:true})],
  WHM:[gauge("lily","ヒーリングリリー","Healing Lily",3,["ヒーリングリリー"],{timeInterval:20,timeGain:1,stack:true}),gauge("blood-lily","ブラッドリリー","Blood Lily",3,["ブラッドリリー"],{stack:true})],
  SCH:[gauge("aetherflow","エーテルフロー","Aetherflow",3,["エーテルフロー"],{stack:true}),gauge("fairy","フェイエーテル","Faerie Gauge",100,["フェイエーテル"])],
  AST:[gauge("cards","カード","Cards",4,["カード"],{stack:true})],
  SGE:[gauge("addersgall","アダーガル","Addersgall",3,["アダーガル"],{timeInterval:20,timeGain:1,stack:true}),gauge("addersting","アダースティング","Addersting",3,["アダースティング"],{stack:true})],
  MNK:[gauge("chakra","闘気","Chakra",5,["闘気"],{stack:true})],
  DRG:[gauge("focus","天竜眼","Firstminds' Focus",2,["天竜眼"],{stack:true})],
  NIN:[gauge("ninki","忍気","Ninki",100,["忍気"])],
  SAM:[gauge("kenki","剣気","Kenki",100,["剣気"])],
  RPR:[gauge("soul","ソウル","Soul",100,["ソウルゲージ"]),gauge("shroud","シュラウド","Shroud",100,["シュラウドゲージ"])],
  VPR:[gauge("offerings","霊力","Serpent Offerings",100,["霊力ゲージ"]),gauge("coil","飛蛇の魂","Rattling Coil",3,["飛蛇の魂"],{stack:true})],
  BRD:[gauge("voice","ソウルボイス","Soul Voice",100,["ソウルボイス"])],
  MCH:[gauge("heat","ヒート","Heat",100,["ヒート"]),gauge("battery","バッテリー","Battery",100,["バッテリー"])],
  DNC:[gauge("esprit","エスプリ","Esprit",100,["エスプリ"])],
  BLM:[gauge("polyglot","ポリグロット","Polyglot",3,["ポリグロット"],{timeInterval:30,timeGain:1,stack:true})],
  SMN:[gauge("aetherflow","エーテルフロー","Aetherflow",2,["エーテルフロー"],{stack:true})],
  RDM:[gauge("black-mana","ブラックマナ","Black Mana",100,["ブラックマナ"]),gauge("white-mana","ホワイトマナ","White Mana",100,["ホワイトマナ"]),gauge("mana-stack","マナスタック","Mana Stack",3,["マナスタック"],{stack:true})],
  PCT:[gauge("palette","パレット","Palette",100,["パレットゲージ"]),gauge("white-paint","ホワイトペイント","White Paint",5,["ホワイトペイント"],{stack:true}),gauge("black-paint","ブラックペイント","Black Paint",1,["ブラックペイント"],{stack:true})],
};

const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
export function extractGaugeEffects(job:string,description:string):GaugeEffect[]{
  const effects:GaugeEffect[]=[];
  for(const definition of JOB_GAUGES[job]||[])for(const alias of definition.aliases){
    const name=escaped(alias),lines=description.split(/\r?\n/);
    for(const line of lines){
      if(!line.includes(alias))continue;
      const random=/発動確率|ことがある|chance/i.test(line),combo=/コンボボーナス|combo bonus/i.test(line);
      const gain=line.match(new RegExp(`「${name}」を(\\d+)上昇`))||(/上昇/.test(line)?line.match(/」を(\d+)上昇/):null);
      if(gain&&!random)effects.push({key:definition.key,add:Number(gain[1]),requiresCombo:combo});
      const stack=line.match(new RegExp(`(\\d+)スタックの「${name}」を付与`));
      if(stack)effects.push({key:definition.key,add:Number(stack[1]),requiresCombo:combo});
      if(definition.stack&&!stack&&new RegExp(`「${name}」を付与`).test(line))effects.push({key:definition.key,add:1,requiresCombo:combo});
      if(new RegExp(`最大スタック分の「${name}」を付与`).test(line))effects.push({key:definition.key,set:definition.maximum});
      if(new RegExp(`「${name}」を全て消費`).test(line))effects.push({key:definition.key,set:0});
      const requirement=line.match(new RegExp(`発動条件：[^\\n]*「${name}」(?:が)?(\\d+)?`));
      const threshold=new RegExp(`「${name}」(?:が)?\\d*(?:未満|以下|以上)`).test(line);
      if(requirement&&!threshold)effects.push({key:definition.key,spend:Number(requirement[1]||1)});
    }
  }
  return effects;
}

export function calculateJobGauges(job:string,rows:GaugeRow[],aaCount=0):GaugeValue[]{
  const definitions=JOB_GAUGES[job]||[],values=new Map(definitions.map(item=>[item.key,0])),maximum=new Map(definitions.map(item=>[item.key,item.maximum]));
  const nextTicks=new Map(definitions.filter(item=>item.timeInterval).map(item=>[item.key,item.timeInterval!]));
  let previousGcd:number|null=null,comboExpires=-Infinity,freeBeast=0,freeMana=0,bloodWeapon=0,bunshin=0,cartridgeMaxUntil=-Infinity;
  const apply=(effect:GaugeEffect,combo:boolean)=>{if(effect.requiresCombo&&!combo)return;const max=maximum.get(effect.key)??100,current=values.get(effect.key)??0;values.set(effect.key,Math.max(0,Math.min(max,effect.set??current+(effect.add||0)-(effect.spend||0))))};
  const advanceTime=(time:number)=>{for(const item of definitions){if(!item.timeInterval||!item.timeGain)continue;let next=nextTicks.get(item.key)!;while(next<=time){apply({key:item.key,add:item.timeGain},true);next+=item.timeInterval}nextTicks.set(item.key,next)}};
  const ordered=[...rows].sort((a,b)=>a.time-b.time);
  for(const row of ordered){
    if(job==="GNB"&&cartridgeMaxUntil>-Infinity&&row.time>=cartridgeMaxUntil){maximum.set("cartridge",3);values.set("cartridge",Math.min(3,values.get("cartridge")||0));cartridgeMaxUntil=-Infinity}
    advanceTime(row.time);
    const combo=!!row.comboFromActionId&&previousGcd===row.comboFromActionId&&row.time<=comboExpires;
    if(row.actionId===7389)freeBeast=3;
    if(row.actionId===7521)freeMana=3;
    if(job==="DRK"&&[3625,7390].includes(row.actionId||0))bloodWeapon=3;
    if(job==="NIN"&&row.actionId===16493)bunshin=5;
    if(job==="GNB"&&row.actionId===16164){maximum.set("cartridge",6);cartridgeMaxUntil=row.time+30}
    for(const effect of row.gaugeEffects||[]){
      if(job==="WAR"&&effect.key==="beast"&&effect.spend&&freeBeast>0){freeBeast--;continue}
      if(job==="RDM"&&["black-mana","white-mana"].includes(effect.key)&&effect.spend&&freeMana>0)continue;
      if(job==="DRK"&&effect.key==="blood"&&effect.add&&[3625,7390].includes(row.actionId||0))continue;
      if(job==="NIN"&&effect.key==="ninki"&&effect.add&&row.actionId===16493)continue;
      apply(effect,combo);
    }
    if(job==="DRK"&&bloodWeapon>0&&row.lane==="gcd"){apply({key:"blood",add:10},true);bloodWeapon--}
    if(job==="NIN"&&bunshin>0&&row.lane==="gcd"){apply({key:"ninki",add:5},true);bunshin--}
    if(job==="RDM"&&freeMana>0&&[7527,7528,7529,7530,37002,37003].includes(row.actionId||0))freeMana--;
    if(job==="PCT"&&row.actionId===34683){apply({key:"white-paint",spend:1},true);apply({key:"black-paint",add:1},true)}
    if(job==="MCH"&&[2864,16501].includes(row.actionId||0))values.set("battery",0);
    if(job==="AST"&&[37017,37018].includes(row.actionId||0))values.set("cards",4);
    if(job==="AST"&&[37019,37020,37021,37022].includes(row.actionId||0))apply({key:"cards",spend:1},true);
    if(row.lane==="gcd"&&row.actionId!==null){if(!row.preservesCombo){previousGcd=row.actionId;comboExpires=row.time+30}}
  }
  for(const item of definitions){
    if(item.aaGain)values.set(item.key,Math.min(item.maximum,(values.get(item.key)||0)+aaCount*item.aaGain));
  }
  return definitions.map(item=>({...item,maximum:maximum.get(item.key)??item.maximum,value:values.get(item.key)||0}));
}
