const JOBS = new Set(["PLD","WAR","DRK","GNB","WHM","SCH","AST","SGE","MNK","DRG","NIN","SAM","RPR","VPR","BRD","MCH","DNC","BLM","SMN","RDM","PCT"]);
const JOB_ROWS:Record<string,number>={PLD:19,WAR:21,DRK:32,GNB:37,WHM:24,SCH:28,AST:33,SGE:40,MNK:20,DRG:22,NIN:30,SAM:34,RPR:39,VPR:41,BRD:23,MCH:31,DNC:38,BLM:25,SMN:27,RDM:35,PCT:42};
const FIELDS="Name,ActionCategory.Name,Cast100ms,Recast100ms,CooldownGroup,Icon,IsPlayerAction,CanTargetHostile,AttackType.Name,ClassJobLevel";
const API="https://v2.xivapi.com/api";

type Action={id:number;name:string;lane:"gcd"|"ability"|"limitbreak"|"unknown";level:number|null;recast:number;cast:number;potency:number;dotPotency:number;dotDuration:number;guaranteedCrit:boolean;guaranteedDh:boolean;iconPath:string;hasDamage:boolean;isReplacement:boolean;isAssignable:boolean};
type ApiRow={row_id?:unknown;fields?:Record<string,unknown>};
const record=(value:unknown):Record<string,unknown>=>typeof value==="object"&&value!==null?value as Record<string,unknown>:{};

export async function GET(request:Request){
  const url=new URL(request.url),job=(url.searchParams.get("job")||"").toUpperCase(),level=Math.min(100,Math.max(1,Number(url.searchParams.get("level"))||100)),language=url.searchParams.get("language")==="en"?"en":"ja";
  if(!JOBS.has(job))return Response.json({error:"unsupported job"},{status:400});
  try{
    const query=`+ClassJobCategory.${job}=true +IsPvP=false +IsPlayerAction=true +ClassJobLevel>0 +ClassJobLevel<=${level} +(ActionCategory=2 ActionCategory=3 ActionCategory=4)`;
    const initial=await searchAll("Action",query,FIELDS,language);
    const unique=new Map<string,Action>();
    for(const row of initial){const a=normalise(row);if(a.name&&a.lane!=="unknown"&&a.isAssignable)unique.set(`${a.id}:${a.name}`,a)}

    const indirections=await searchAll("ActionIndirection",`+ClassJob=${JOB_ROWS[job]}`,"Name,ClassJob,PreviousComboAction",language);
    const pairs=indirections.map(r=>({actionId:refId(r.fields?.Name),previousId:refId(r.fields?.PreviousComboAction)})).filter(p=>p.actionId>0&&p.previousId>0);
    const relatedIds=[...new Set(pairs.flatMap(p=>[p.actionId,p.previousId]))];
    const metadata=await fetchActions(relatedIds,language);
    const levels=new Map<number,number>();for(const [id,a] of metadata)levels.set(id,a.level||1);
    for(let pass=0;pass<=pairs.length;pass++)for(const p of pairs){const inherited=Math.max(levels.get(p.actionId)||1,levels.get(p.previousId)||1);levels.set(p.actionId,inherited)}
    for(const p of pairs){const a=metadata.get(p.actionId),prev=metadata.get(p.previousId),effective=levels.get(p.actionId)||1;if(!a?.name||effective>level)continue;const lane=a.lane==="unknown"?prev?.lane:a.lane;if(!lane||lane==="unknown"||lane==="limitbreak")continue;const merged={...a,lane,level:effective,isAssignable:false,isReplacement:true};unique.set(`${merged.id}:${merged.name}`,merged)}

    const descriptions=await fetchDescriptions([...unique.values()].map(a=>a.id),language);
    for(const a of unique.values()){const description=descriptions.get(a.id);if(description){const dot=extractDot(description);a.dotPotency=dot.potency;a.dotDuration=dot.duration;a.potency=extractPotency(dot.directText);a.hasDamage=a.potency>0||a.dotPotency>0;a.guaranteedCrit=a.hasDamage&&/(?:必ず[^。\n]{0,30}クリティカルヒット|guaranteed (?:to be )?a critical|guaranteed critical)/i.test(description);a.guaranteedDh=a.hasDamage&&/(?:必ず[^。\n]{0,30}ダイレクトヒット|critical direct hit|guaranteed (?:to be )?a direct|guaranteed direct)/i.test(description)}}
    for(const [id,a] of await fetchActions(limitBreakIds(job),language)){if(a.name)unique.set(`lb:${id}`,{...a,level:null})}
    const actions=[...unique.values()].sort((a,b)=>priority(a)-priority(b)||(a.level??999)-(b.level??999)||a.id-b.id||a.name.localeCompare(b.name,language));
    return Response.json({job,level,language,count:actions.length,actions},{headers:{"Cache-Control":"public, max-age=86400"}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"xivapi unavailable"},{status:502})}
}

async function searchAll(sheet:string,query:string,fields:string,language:string){
  const rows:ApiRow[]=[];let next:string|null=null;
  do{const params=next?new URLSearchParams({cursor:next,fields,language,limit:"500"}):new URLSearchParams({sheets:sheet,query,fields,language,limit:"500"});const response=await fetch(`${API}/search?${params}`);if(!response.ok)throw new Error(`XIVAPI search failed (${response.status})`);const data=record(await response.json());const results=Array.isArray(data.results)?data.results.filter((row):row is ApiRow=>typeof row==="object"&&row!==null):[];rows.push(...results);next=typeof data.next==="string"?data.next:null}while(next);
  return rows;
}
async function fetchActions(ids:number[],language:string){const result=new Map<number,Action>();for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100);if(!batch.length)continue;const response=await fetch(`${API}/sheet/Action?${new URLSearchParams({rows:batch.join(","),fields:FIELDS,language})}`);if(!response.ok)continue;const data=record(await response.json()),rows=Array.isArray(data.rows)?data.rows.filter((row):row is ApiRow=>typeof row==="object"&&row!==null):[];for(const row of rows)result.set(Number(row.row_id),normalise(row))}return result}
async function fetchDescriptions(ids:number[],language:string){const result=new Map<number,string>();for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100),response=await fetch(`${API}/sheet/ActionTransient?${new URLSearchParams({rows:batch.join(","),fields:"Description",language})}`);if(!response.ok)continue;const data=record(await response.json()),rows=Array.isArray(data.rows)?data.rows.filter((row):row is ApiRow=>typeof row==="object"&&row!==null):[];for(const row of rows){const description=row.fields?.Description;if(description)result.set(Number(row.row_id),String(description))}}return result}
function normalise(row:ApiRow):Action{const f=row.fields||{},category=Number(record(f.ActionCategory).value),lane=category===2||category===3?"gcd":category===4?"ability":category===9?"limitbreak":"unknown";return{id:Number(row.row_id),name:String(f.Name||""),lane,level:Number(f.ClassJobLevel)||1,recast:Number(f.Recast100ms||0)/10,cast:Number(f.Cast100ms||0)/10,potency:0,dotPotency:0,dotDuration:0,guaranteedCrit:false,guaranteedDh:false,iconPath:String(record(f.Icon).path||""),hasDamage:Boolean(f.CanTargetHostile)&&Number(record(f.AttackType).value)>0,isReplacement:false,isAssignable:f.IsPlayerAction!==false}}
function extractPotency(description:string){const matches=[...description.matchAll(/(?:(?:威力|Potency|Attacke-Wert|Puissance)\s*[:：]\s*|(?:a\s+)?potency\s+of\s+)(\d+)/gi)].map(match=>Number(match[1])).filter(Number.isFinite);return matches[0]||0}
function extractDot(description:string){
  const marker=/(?:継続ダメージ|damage over time)/i.exec(description);
  if(!marker)return{potency:0,duration:0,directText:description};
  const segment=description.slice(marker.index,marker.index+360),potency=extractPotency(segment);
  const durationMatch=segment.match(/(?:効果時間|Duration)\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i),duration=durationMatch?Number(durationMatch[1]):0;
  return{potency,duration,directText:description.slice(0,marker.index)};
}
function refId(value:unknown){if(Number.isInteger(Number(value))&&Number(value)>0)return Number(value);const reference=record(value);return Number(reference.row_id??reference.value??reference.id)||0}
function priority(a:Action){if(a.lane==="gcd"&&a.hasDamage)return 0;if(a.lane==="ability"&&a.hasDamage)return 1;if(a.lane==="gcd")return 2;if(a.lane==="ability")return 3;return 4}
function limitBreakIds(job:string){const tank:Record<string,number>={PLD:199,WAR:4240,DRK:4241,GNB:17105},melee:Record<string,number>={MNK:202,DRG:4242,NIN:4243,SAM:7861,RPR:24858,VPR:34866},ranged:Record<string,number>={BRD:4244,MCH:4245,DNC:17106},caster:Record<string,number>={BLM:205,SMN:4246,RDM:7862,PCT:34867},healer:Record<string,number>={WHM:208,SCH:4247,AST:4248,SGE:24859};if(tank[job])return[197,198,tank[job]];if(melee[job])return[200,201,melee[job]];if(ranged[job])return[4238,4239,ranged[job]];if(caster[job])return[203,204,caster[job]];if(healer[job])return[206,207,healer[job]];return[]}
