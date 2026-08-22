export const ROTATION_LIBRARY_LIMIT=30;

export type RotationLibraryEntry<TRow,TStats>={
  id:string;
  title:string;
  job:string;
  rows:TRow[];
  stats:TStats;
  createdAt:number;
  updatedAt:number;
};

export function upsertRotationLibraryEntry<T>(entries:T[],entry:T,getId:(item:T)=>string){
  const index=entries.findIndex(item=>getId(item)===getId(entry));
  if(index>=0)return entries.map((item,itemIndex)=>itemIndex===index?entry:item);
  if(entries.length>=ROTATION_LIBRARY_LIMIT)return entries;
  return[entry,...entries];
}
