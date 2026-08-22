import assert from "node:assert/strict";
import test from "node:test";
import {calculateDamage} from "../app/damage-engine";
import {calculateRecastState,hasIndividualRecast} from "../app/recast-timer";

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

test("charge recasts recover sequentially and expose remaining stacks",()=>{
  const action={id:1,name:"Charge",lane:"ability" as const,recast:30,gcdRecast:0,maxCharges:2,iconPath:""},usages=[{actionId:1,time:0},{actionId:1,time:1}];
  assert.deepEqual(calculateRecastState(action,usages,10),{...action,charges:0,remaining:20,readyAt:30});
  assert.deepEqual(calculateRecastState(action,usages,30),{...action,charges:1,remaining:30,readyAt:30});
  assert.deepEqual(calculateRecastState(action,usages,60),{...action,charges:2,remaining:0,readyAt:60});
  assert.equal(hasIndividualRecast({...action,lane:"gcd",gcdRecast:2.5,recast:2.5}),false);
  assert.equal(hasIndividualRecast({...action,lane:"gcd",gcdRecast:0,recast:60}),true);
});
