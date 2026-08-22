export type RecastPreferenceItem = { id:number };

// Shared role actions use the same action IDs across every job in that role.
export const ROLE_ACTION_IDS = new Set([
  7531,7533,7535,7537,7538,7540,7541,7542,7546,7548,7549,
  7551,7553,7554,7557,7559,7560,7561,7562,7568,7571,7863,16560,25880,
]);

export function isRoleAction(actionId:number){
  return ROLE_ACTION_IDS.has(actionId);
}

export function sortRecastItems<T extends RecastPreferenceItem>(items:T[],order:string[]){
  const rank=new Map(order.map((id,index)=>[id,index]));
  return items.map((item,index)=>({item,index})).sort((left,right)=>{
    const roleDifference=Number(isRoleAction(left.item.id))-Number(isRoleAction(right.item.id));
    if(roleDifference)return roleDifference;
    const leftRank=rank.get(String(left.item.id)),rightRank=rank.get(String(right.item.id));
    if(leftRank!==undefined&&rightRank!==undefined)return leftRank-rightRank;
    if(leftRank!==undefined)return -1;
    if(rightRank!==undefined)return 1;
    return left.index-right.index;
  }).map(entry=>entry.item);
}

export function moveRecastItem(items:RecastPreferenceItem[],order:string[],sourceId:string,targetId:string){
  if(sourceId===targetId)return order;
  const sorted=sortRecastItems(items,order),source=sorted.find(item=>String(item.id)===sourceId),target=sorted.find(item=>String(item.id)===targetId);
  if(!source||!target||isRoleAction(source.id)!==isRoleAction(target.id))return sorted.map(item=>String(item.id));
  const ids=sorted.map(item=>String(item.id)),from=ids.indexOf(sourceId),to=ids.indexOf(targetId);
  ids.splice(from,1);
  ids.splice(to,0,sourceId);
  return ids;
}
