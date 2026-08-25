import assert from "node:assert/strict";
import test from "node:test";
import {calculateDamage} from "../app/damage-engine";
import {calculateRecastState,hasIndividualRecast} from "../app/recast-timer";
import {actionMpCostFromFields,adjustedActionMpCost} from "../app/calculation/mp-config";
import {calculateJobGauges,extractGaugeEffects} from "../app/calculation/job-gauges";

const stats={level:100,weapon:152,aaInterval:2.24,aaSpeed:420,main:5857,aaMain:440,crit:3242,dh:1230,det:2883,speed:420,tenacity:420,gcd:2.5,potionPercent:10,potionCap:392,simulationIterations:1};
const base={id:"",name:"",lane:"gcd" as const,potency:0,cast:0,recast:2.5,gcdRecast:2.5,modifier:"none" as const,modifierValue:0};

test("Royal Authority grants one instant 500-potency Holy Spirit",()=>{
  const rows=[
    {...base,id:"1",name:"Fast Blade",time:0,actionId:9,potency:220},
    {...base,id:"2",name:"Riot Blade",time:2.505,actionId:15,potency:170,comboPotency:330,comboFromActionId:9},
    {...base,id:"3",name:"Royal Authority",time:5.01,actionId:3539,potency:200,comboPotency:460,comboFromActionId:15},
    {...base,id:"4",name:"Holy Spirit",time:7.515,actionId:7384,potency:400,cast:1.5,preservesCombo:true},
  ];
  const result=calculateDamage(rows,stats,"PLD",{},{simulate:false}),holy=result.at(-1)!;
  assert.equal(holy.potency,500);
  assert.equal(holy.effectiveCast,0);
  assert.equal(holy.prepare,7.515);
  assert.equal(holy.nextOgcd,8.14);
  assert.equal(holy.sumPotency,1510);
  assert.equal(holy.aaCount,4);
});

test("cast actions unlock oGCD after 80 percent of cast plus 0.625 seconds",()=>{
  const [instant]=calculateDamage([{...base,id:"i",name:"Instant",time:0,actionId:9,potency:220}],stats,"PLD",{},{simulate:false});
  const [cast]=calculateDamage([{...base,id:"c",name:"Holy Spirit",time:0,actionId:7384,potency:400,cast:1.5}],stats,"PLD",{},{simulate:false});
  assert.equal(instant.nextOgcd,.625);
  assert.equal(cast.prepare,1.5);
  assert.equal(cast.nextOgcd,1.825);
  assert.equal(instant.sumPotency,220);
  assert.equal(instant.aaCount,1);
});

test("computed rows expose active buff timers, stacks, and MP at the timeline cursor",()=>{
  const rows=[
    {...base,id:"buff",name:"Royal Authority",time:0,actionId:3539,potency:200,comboPotency:460,comboFromActionId:15,mpCost:1000},
    {...base,id:"wait",name:"Wait",time:3,actionId:9,potency:220,mpCost:500},
  ];
  const overrides={jobs:{PLD:{buffs:[{sourceActionId:3539,key:"test-stack",duration:10,stacks:2}],actions:{}}}};
  const result=calculateDamage(rows,stats,"PLD",overrides,{simulate:false});
  assert.equal(result[0].mp,9000);
  assert.equal(result[1].mp,8700);
  assert.deepEqual(result[1].activeBuffs.map(buff=>({key:buff.key,remaining:buff.remaining,stacks:buff.remainingStacks})),[{key:"test-stack",remaining:7,stacks:2}]);
});

test("level traits adjust catalog MP costs before they reach the timeline",()=>{
  assert.equal(adjustedActionMpCost("PLD",100,2000),1000);
  assert.equal(adjustedActionMpCost("PLD",100,4000),2000);
  assert.equal(adjustedActionMpCost("PLD",60,4000),4000);
  assert.equal(adjustedActionMpCost("RDM",100,400),400);
});

test("standard and palette-aware MP cost fields are decoded",()=>{
  assert.equal(actionMpCostFromFields(3,4),400);
  assert.equal(actionMpCostFromFields(96,3),300);
  assert.equal(actionMpCostFromFields(96,4),400);
  assert.equal(actionMpCostFromFields(92,3),300);
  assert.equal(actionMpCostFromFields(92,4),400);
  assert.equal(actionMpCostFromFields(0,4),0);
});

test("job gauges are derived from API descriptions and timeline actions",()=>{
  const gain=extractGaugeEffects("GNB","コンボボーナス：自身に「ソイル」を付与する。"),spend=extractGaugeEffects("GNB","発動条件：「ソイル」2");
  assert.deepEqual(gain,[{key:"cartridge",add:1,requiresCombo:true}]);
  assert.deepEqual(spend,[{key:"cartridge",spend:2}]);
  assert.deepEqual(extractGaugeEffects("MNK","自身に「闘気」を付与する。\\n発動条件：「闘気」5未満"),[{key:"chakra",add:1,requiresCombo:false}]);
  const rows=[
    {time:0,actionId:16139,lane:"gcd" as const},
    {time:2.5,actionId:16137,lane:"gcd" as const,comboFromActionId:16139},
    {time:5,actionId:16145,lane:"gcd" as const,comboFromActionId:16137,gaugeEffects:gain},
    {time:7.5,actionId:25760,lane:"gcd" as const,gaugeEffects:spend},
  ];
  assert.equal(calculateJobGauges("GNB",rows)[0].value,0);
});

test("time and auto-attack gauges are calculated without manual input",()=>{
  const whiteMage=calculateJobGauges("WHM",[{time:20,actionId:16531,lane:"gcd",gaugeEffects:[{key:"lily",spend:1},{key:"blood-lily",add:1}]}]);
  assert.deepEqual(whiteMage.map(item=>item.value),[0,1]);
  assert.equal(calculateJobGauges("PLD",[],7)[0].value,35);
});

test("job-specific gauge timers and paired resources are replayed",()=>{
  const paired=extractGaugeEffects("RDM","追加効果：「ブラックマナ」と「ホワイトマナ」を4上昇させる。");
  assert.deepEqual(paired,[{key:"black-mana",add:4,requiresCombo:false},{key:"white-mana",add:4,requiresCombo:false}]);
  const darkKnight=calculateJobGauges("DRK",[
    {time:0,actionId:7390,lane:"ability",gaugeEffects:[{key:"blood",add:10}]},
    {time:.625,actionId:3617,lane:"gcd"},
    {time:3.13,actionId:3623,lane:"gcd"},
    {time:5.635,actionId:3632,lane:"gcd",gaugeEffects:[{key:"blood",add:20,requiresCombo:true}],comboFromActionId:3623},
  ]);
  assert.equal(darkKnight[0].value,50);
  const gunbreaker=calculateJobGauges("GNB",[{time:0,actionId:16164,lane:"ability",gaugeEffects:[{key:"cartridge",add:3}]}]);
  assert.deepEqual([gunbreaker[0].value,gunbreaker[0].maximum],[3,6]);
});

test("job actions restore MP and combo-only restoration requires its combo",()=>{
  const pldRows=[
    {...base,id:"spell",name:"Holy Spirit",time:0,actionId:7384,mpCost:1000},
    {...base,id:"fast",name:"Fast Blade",time:1,actionId:9},
    {...base,id:"riot",name:"Riot Blade",time:2,actionId:15,comboFromActionId:9},
  ];
  const pld=calculateDamage(pldRows,stats,"PLD",{},{simulate:false});
  assert.equal(pld[0].mp,9000);
  assert.equal(pld[2].mp,10000);

  const drkRows=[
    {...base,id:"edge",name:"Edge of Shadow",lane:"ability" as const,time:0,actionId:16470,mpCost:3000},
    {...base,id:"delirium",name:"Delirium",lane:"ability" as const,time:.625,actionId:7390},
    {...base,id:"scarlet",name:"Scarlet Delirium",time:1.25,actionId:36928},
  ];
  const drk=calculateDamage(drkRows,stats,"DRK",{},{simulate:false});
  assert.equal(drk[0].mp,7000);
  assert.equal(drk[2].mp,7800);
});

test("healer recovery, Lucid Dreaming, cost nullification, and the MP-free option are tracked",()=>{
  const lucidRows=[
    {...base,id:"cost",name:"Expensive spell",time:0,actionId:119,mpCost:2000},
    {...base,id:"lucid",name:"Lucid Dreaming",lane:"ability" as const,time:.625,actionId:7562},
    {...base,id:"cursor",name:"Cursor",lane:"ability" as const,time:3,actionId:1},
  ];
  const lucid=calculateDamage(lucidRows,stats,"WHM",{},{simulate:false});
  assert.equal(lucid.at(-1)!.mp,8750);

  const thinAir=calculateDamage([
    {...base,id:"thin",name:"Thin Air",lane:"ability" as const,time:0,actionId:7430},
    {...base,id:"heal",name:"Cure III",time:.625,actionId:131,mpCost:1500},
  ],stats,"WHM",{},{simulate:false});
  assert.equal(thinAir.at(-1)!.mp,10000);

  const assize=calculateDamage([
    {...base,id:"g1",name:"Glare",time:0,actionId:16533,mpCost:400},
    {...base,id:"g2",name:"Glare",time:2.5,actionId:16533,mpCost:400},
    {...base,id:"assize",name:"Assize",lane:"ability" as const,time:3.125,actionId:3571},
  ],stats,"WHM",{},{simulate:false});
  assert.equal(assize.at(-1)!.mp,9900);

  for(const job of ["WHM","SCH","AST","SGE","SMN","RDM","PCT"]){
    const noCost=calculateDamage([{...base,id:"spell",name:"MP spell",time:0,actionId:999999,mpCost:300}],{...stats,ignoreMpCosts:true},job,{},{simulate:false});
    assert.equal(noCost[0].mp,10000,job);
  }
  const blackMage=calculateDamage([{...base,id:"spell",name:"MP spell",time:0,actionId:999999,mpCost:300}],{...stats,ignoreMpCosts:true},"BLM",{},{simulate:false});
  assert.equal(blackMage[0].mp,9700);
});

test("Black Mage MP follows Astral Fire, Umbral Ice, and ice-spell restoration",()=>{
  const rows=[
    {...base,id:"f3",name:"Fire III",time:0,actionId:152,aspectId:1,attackTypeId:5,mpCost:2000},
    {...base,id:"f4",name:"Fire IV",time:3.5,actionId:3577,aspectId:1,attackTypeId:5,mpCost:800},
    {...base,id:"b3",name:"Blizzard III",time:7,actionId:154,aspectId:2,attackTypeId:5,mpCost:800},
    {...base,id:"b4",name:"Blizzard IV",time:10.5,actionId:3576,aspectId:2,attackTypeId:5,mpCost:800},
  ];
  const result=calculateDamage(rows,stats,"BLM",{},{simulate:false});
  assert.equal(result[0].mp,8000);
  assert.equal(result[1].mp,6400);
  assert.equal(result[2].mp,6400);
  assert.equal(result[3].mp,10000);
});

test("charge recasts recover sequentially and expose remaining stacks",()=>{
  const action={id:1,name:"Charge",lane:"ability" as const,recast:30,gcdRecast:0,maxCharges:2,iconPath:""},usages=[{actionId:1,time:0},{actionId:1,time:1}];
  assert.deepEqual(calculateRecastState(action,usages,10),{...action,charges:0,remaining:20,readyAt:30});
  assert.deepEqual(calculateRecastState(action,usages,30),{...action,charges:1,remaining:30,readyAt:30});
  assert.deepEqual(calculateRecastState(action,usages,60),{...action,charges:2,remaining:0,readyAt:60});
  assert.equal(hasIndividualRecast({...action,lane:"gcd",gcdRecast:2.5,recast:2.5}),false);
  assert.equal(hasIndividualRecast({...action,lane:"gcd",gcdRecast:0,recast:60}),true);
});
