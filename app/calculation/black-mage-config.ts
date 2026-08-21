export type BlackMageElement="none"|"fire"|"ice";
export type BlackMageState={element:BlackMageElement;stacks:number;expires:number};

const FIRE=1,ICE=2,MAGIC_ATTACK_TYPE=5,ELEMENT_DURATION=15;
const MAX_FIRE_ACTIONS=new Set([147,152,162,16505,25794]);
const MAX_ICE_ACTIONS=new Set([146,154,25795]);

export const initialBlackMageState=():BlackMageState=>({element:"none",stacks:0,expires:-Infinity});

export function blackMageDamageMultipliers(state:BlackMageState,time:number,level:number,aspectId:number,attackTypeId:number){
  if(state.element==="none"||time>=state.expires||attackTypeId!==MAGIC_ATTACK_TYPE)return[];
  const enochian=level>=96?1.27:level>=86?1.22:level>=78?1.15:level>=70?1.1:level>=56?1.05:1;
  const elemental=aspectId===FIRE?(state.element==="fire"?[1,1.4,1.6,1.8][state.stacks]:[1,.9,.8,.7][state.stacks]):aspectId===ICE&&state.element==="fire"?[1,.9,.8,.7][state.stacks]:1;
  return[elemental,enochian].filter(value=>value!==1);
}

export function advanceBlackMageState(current:BlackMageState,actionId:number,time:number):BlackMageState{
  const state=time>=current.expires?initialBlackMageState():current;
  if(actionId===149){
    if(state.element==="fire")return{element:"ice",stacks:1,expires:time+ELEMENT_DURATION};
    if(state.element==="ice")return{element:"fire",stacks:1,expires:time+ELEMENT_DURATION};
    return state;
  }
  if(actionId===158)return{element:"fire",stacks:3,expires:time+ELEMENT_DURATION};
  if(actionId===16506&&state.element==="ice")return{element:"ice",stacks:Math.min(3,state.stacks+1),expires:time+ELEMENT_DURATION};
  if(MAX_FIRE_ACTIONS.has(actionId))return{element:"fire",stacks:3,expires:time+ELEMENT_DURATION};
  if(MAX_ICE_ACTIONS.has(actionId))return{element:"ice",stacks:3,expires:time+ELEMENT_DURATION};
  if(actionId===141){
    if(state.element==="ice")return initialBlackMageState();
    return{element:"fire",stacks:Math.min(3,(state.element==="fire"?state.stacks:0)+1),expires:time+ELEMENT_DURATION};
  }
  if(actionId===142){
    if(state.element==="fire")return initialBlackMageState();
    return{element:"ice",stacks:Math.min(3,(state.element==="ice"?state.stacks:0)+1),expires:time+ELEMENT_DURATION};
  }
  return state;
}
