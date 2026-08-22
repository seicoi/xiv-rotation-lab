export type RecastAction = {
  id:number;
  name:string;
  lane:"gcd"|"ability"|"limitbreak";
  recast:number;
  gcdRecast:number;
  maxCharges:number;
  iconPath:string;
};

export type RecastUsage = { actionId:number|null; time:number };

export type RecastState<T extends RecastAction = RecastAction> = T & {
  charges:number;
  remaining:number;
  readyAt:number;
};

export function hasIndividualRecast(action:RecastAction){
  if(action.id<=0||action.recast<=0||action.lane==="limitbreak")return false;
  return action.lane==="ability"||action.gcdRecast<=0;
}

export function calculateRecastState<T extends RecastAction>(action:T,usages:RecastUsage[],now:number):RecastState<T>{
  const maximum=Math.max(1,Math.floor(action.maxCharges||1)),recast=Math.max(0,action.recast);
  let charges=maximum,nextChargeAt=Infinity;
  const advance=(until:number)=>{
    while(charges<maximum&&nextChargeAt<=until){
      charges++;
      nextChargeAt=charges<maximum?nextChargeAt+recast:Infinity;
    }
  };
  for(const usage of usages.filter(item=>item.actionId===action.id&&item.time<=now).sort((a,b)=>a.time-b.time)){
    advance(usage.time);
    if(charges<=0)continue;
    if(charges===maximum)nextChargeAt=usage.time+recast;
    charges--;
  }
  advance(now);
  const readyAt=charges>0?now:nextChargeAt,remaining=charges<maximum?Math.max(0,nextChargeAt-now):0;
  return{...action,charges,remaining,readyAt};
}

export function calculateRecastStates<T extends RecastAction>(actions:T[],usages:RecastUsage[],now:number){
  return actions.filter(hasIndividualRecast).map(action=>calculateRecastState(action,usages,now));
}
