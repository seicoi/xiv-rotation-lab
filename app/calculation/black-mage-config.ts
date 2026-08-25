export type BlackMageElement="none"|"fire"|"ice";
export type BlackMageState={element:BlackMageElement;stacks:number;expires:number;hearts:number;firestarter:boolean};

const FIRE=1,ICE=2,MAGIC_ATTACK_TYPE=5,ELEMENT_DURATION=15;
const MAX_FIRE_ACTIONS=new Set([147,152,162,16505,25794]);
const MAX_ICE_ACTIONS=new Set([146,154,25793,25795]);
const HEART_GRANTERS=new Set([159,3576]);

export const initialBlackMageState=():BlackMageState=>({element:"none",stacks:0,expires:-Infinity,hearts:0,firestarter:false});

export function blackMageDamageMultipliers(state:BlackMageState,time:number,level:number,aspectId:number,attackTypeId:number){
  if(state.element==="none"||time>=state.expires||attackTypeId!==MAGIC_ATTACK_TYPE)return[];
  const enochian=level>=96?1.27:level>=86?1.22:level>=78?1.15:level>=70?1.1:level>=56?1.05:1;
  const elemental=aspectId===FIRE?(state.element==="fire"?[1,1.4,1.6,1.8][state.stacks]:[1,.9,.8,.7][state.stacks]):aspectId===ICE&&state.element==="fire"?[1,.9,.8,.7][state.stacks]:1;
  return[elemental,enochian].filter(value=>value!==1);
}

export function advanceBlackMageState(current:BlackMageState,actionId:number,time:number):BlackMageState{
  const state=time>=current.expires?initialBlackMageState():current;
  if(actionId===149){
    if(state.element==="fire")return{...state,element:"ice",stacks:1,expires:time+ELEMENT_DURATION};
    if(state.element==="ice")return{...state,element:"fire",stacks:1,expires:time+ELEMENT_DURATION};
    return state;
  }
  if(actionId===158)return{...state,element:"fire",stacks:3,expires:time+ELEMENT_DURATION,hearts:3};
  if(actionId===16506&&state.element==="ice")return{...state,element:"ice",stacks:Math.min(3,state.stacks+1),expires:time+ELEMENT_DURATION,hearts:Math.min(3,state.hearts+1)};
  if(MAX_FIRE_ACTIONS.has(actionId))return{...state,element:"fire",stacks:3,expires:time+ELEMENT_DURATION};
  if(MAX_ICE_ACTIONS.has(actionId))return{...state,element:"ice",stacks:3,expires:time+ELEMENT_DURATION};
  if(HEART_GRANTERS.has(actionId))return{...state,hearts:3};
  if(actionId===141){
    if(state.element==="ice")return initialBlackMageState();
    return{...state,element:"fire",stacks:Math.min(3,(state.element==="fire"?state.stacks:0)+1),expires:time+ELEMENT_DURATION};
  }
  if(actionId===142){
    if(state.element==="fire")return initialBlackMageState();
    return{...state,element:"ice",stacks:Math.min(3,(state.element==="ice"?state.stacks:0)+1),expires:time+ELEMENT_DURATION};
  }
  return state;
}

const FLARE=162,DESPAIR=16505,PARADOX=25797,MANAFONT=158,UMBRAL_SOUL=16506,FIRE_III=152;
const iceRestore=(stacks:number)=>[0,2500,5000,10000][Math.max(0,Math.min(3,stacks))];

export function resolveBlackMageMp(current:BlackMageState,actionId:number,time:number,aspectId:number,baseCost:number,currentMp:number){
  let state=time>=current.expires?initialBlackMageState():{...current};
  const wasFire=state.element==="fire";
  if(actionId===MANAFONT){state=advanceBlackMageState(state,actionId,time);return{state,mp:10000,cost:0,restore:Math.max(0,10000-currentMp)}}
  if(actionId===UMBRAL_SOUL){state=advanceBlackMageState(state,actionId,time);const restore=iceRestore(state.stacks);return{state,mp:Math.min(10000,currentMp+restore),cost:0,restore}}

  const fire=aspectId===FIRE,ice=aspectId===ICE;
  let cost=Math.max(0,baseCost),restore=0;
  if(actionId===PARADOX)cost=state.element==="fire"?1600:0;
  else if(fire){
    if(state.element==="ice")cost=0;
    else if(actionId===FLARE){cost=state.hearts>0?2*Math.floor(currentMp/3):currentMp;state.hearts=0}
    else if(actionId===DESPAIR)cost=currentMp;
    else if(actionId===FIRE_III&&state.firestarter){cost=0;state.firestarter=false}
    else if(state.element==="fire"&&state.hearts>0){state.hearts--;cost=baseCost}
    else if(state.element==="fire")cost=baseCost*2;
  }else if(ice){
    if(state.element!=="none")cost=0;
    if(state.element==="ice")restore=iceRestore(state.stacks);
  }
  const mp=Math.min(10000,Math.max(0,currentMp-cost)+restore);
  state=advanceBlackMageState(state,actionId,time);
  if(actionId===PARADOX&&wasFire)state={...state,firestarter:true};
  return{state,mp,cost,restore};
}
