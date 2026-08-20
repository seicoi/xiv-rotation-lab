const AUTHORIZE_URL = "https://www.fflogs.com/oauth/authorize";
const TOKEN_URL = "https://www.fflogs.com/oauth/token";
const API_URL = "https://www.fflogs.com/api/v2/user";

const STORAGE = {
  verifier: "xivRotationLab.pkceVerifier",
  state: "xivRotationLab.oauthState",
  token: "xivRotationLab.accessToken",
  expiresAt: "xivRotationLab.expiresAt",
};

const REPORT_CONTEXT_QUERY = `
  query ReportContext($code: String!, $fightIDs: [Int!]) {
    reportData {
      report(code: $code) {
        title
        startTime
        fights(fightIDs: $fightIDs) { id name startTime endTime kill friendlyPlayers }
        masterData {
          abilities { gameID name icon type }
          actors { id name type subType petOwner }
        }
      }
    }
  }
`;

const CAST_EVENTS_QUERY = `
  query CastEvents($code: String!, $fightIDs: [Int!], $sourceID: Int!, $startTime: Float) {
    reportData {
      report(code: $code) {
        events(
          fightIDs: $fightIDs
          sourceID: $sourceID
          dataType: Casts
          startTime: $startTime
          limit: 10000
        ) { data nextPageTimestamp }
      }
    }
  }
`;

export type LogActor = { id:number; name:string; type:string; subType:string; petOwner?:number };
export type LogAbility = { gameID:number; name:string; icon?:string; type?:number };
export type LogFight = { id:number; name:string; startTime:number; endTime:number; kill:boolean; friendlyPlayers:number[] };
export type LogReport = { title:string; startTime:number; fights:LogFight[]; masterData:{abilities:LogAbility[];actors:LogActor[]} };
export type LogReportContext = { reportCode:string; fightId:number|"last"; sourceId:number|null; report:LogReport; fight:LogFight };
export type LogCastEvent = { timestamp:number; type:string; abilityGameID:number; targetID?:number };
export type LogPlayer = { id:number; name:string; job:string };
type QueryData = { reportData?:{ report?:(LogReport&{events?:{data?:LogCastEvent[];nextPageTimestamp?:number|null}}) } };
type ApiPayload = { access_token?:string; expires_in?:number|string; error_description?:string; data?:QueryData; errors?:{message?:string}[] };

export function getLogRedirectUri() {
  return new URL("./", window.location.href).href;
}

export function hasValidLogToken() {
  const token=sessionStorage.getItem(STORAGE.token),expiresAt=Number(sessionStorage.getItem(STORAGE.expiresAt));
  return Boolean(token&&expiresAt>Date.now()+30_000);
}

export function hasLogCallback() {
  const params=new URLSearchParams(window.location.search);
  return params.has("code")||params.has("error");
}

export function clearLogSession() {
  Object.values(STORAGE).forEach(key=>sessionStorage.removeItem(key));
}

export async function beginLogLogin(clientId:string) {
  requireClientId(clientId);
  const verifier=randomBase64Url(64),state=randomBase64Url(32),challenge=await sha256Base64Url(verifier);
  sessionStorage.setItem(STORAGE.verifier,verifier);
  sessionStorage.setItem(STORAGE.state,state);
  const url=new URL(AUTHORIZE_URL);
  url.search=new URLSearchParams({client_id:clientId,redirect_uri:getLogRedirectUri(),response_type:"code",code_challenge:challenge,code_challenge_method:"S256",state}).toString();
  window.location.assign(url);
}

export async function completeLogLogin(clientId:string) {
  const params=new URLSearchParams(window.location.search),code=params.get("code"),error=params.get("error");
  if(!code&&!error)return false;
  requireClientId(clientId);
  if(error)throw new Error(params.get("error_description")||`認証エラー: ${error}`);
  const expectedState=sessionStorage.getItem(STORAGE.state),verifier=sessionStorage.getItem(STORAGE.verifier);
  if(!expectedState||params.get("state")!==expectedState||!verifier){clearLogSession();throw new Error("認証状態を確認できませんでした。もう一度接続してください。")}
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,grant_type:"authorization_code",code,redirect_uri:getLogRedirectUri(),code_verifier:verifier})});
  const payload=await readJson(response);
  if(!response.ok||typeof payload.access_token!=="string")throw new Error(typeof payload.error_description==="string"?payload.error_description:`アクセストークンを取得できませんでした (${response.status})。`);
  sessionStorage.setItem(STORAGE.token,payload.access_token);
  sessionStorage.setItem(STORAGE.expiresAt,String(Date.now()+Number(payload.expires_in||3600)*1000));
  sessionStorage.removeItem(STORAGE.verifier);sessionStorage.removeItem(STORAGE.state);
  window.history.replaceState({},document.title,getLogRedirectUri());
  return true;
}

export function parseLogReportUrl(value:string) {
  let url:URL;
  try{url=new URL(value)}catch{throw new Error("戦闘レポートのURLを指定してください。")}
  if(!/(^|\.)fflogs\.com$/i.test(url.hostname))throw new Error("対応している戦闘レポートのURLではありません。");
  const reportCode=url.pathname.match(/^\/reports\/([^/]+)/i)?.[1];
  if(!reportCode||!/^[A-Za-z0-9]+$/.test(reportCode))throw new Error("URLからレポートコードを取得できませんでした。");
  const hashParams=new URLSearchParams(url.hash.replace(/^#/,"")),fightValue=url.searchParams.get("fight")??hashParams.get("fight"),sourceValue=url.searchParams.get("source")??hashParams.get("source");
  const fightId=fightValue==="last"?"last":positiveInteger(fightValue,"fight"),sourceId=sourceValue?positiveInteger(sourceValue,"source"):null;
  return {reportCode,fightId,sourceId};
}

export async function fetchLogReportContext(parsed:{reportCode:string;fightId:number|"last";sourceId:number|null}):Promise<LogReportContext> {
  const data=await query(REPORT_CONTEXT_QUERY,{code:parsed.reportCode,fightIDs:parsed.fightId==="last"?null:[parsed.fightId]});
  const report=data?.reportData?.report as LogReport|undefined;
  if(!report)throw new Error("戦闘レポートが見つかりませんでした。");
  const fight=parsed.fightId==="last"?report.fights?.reduce<LogFight|null>((latest,item)=>!latest||item.id>latest.id?item:latest,null):report.fights?.find(item=>item.id===parsed.fightId);
  if(!fight)throw new Error(`fight=${parsed.fightId} が見つかりませんでした。`);
  return {...parsed,report,fight};
}

export function listLogPlayers(context:LogReportContext):LogPlayer[] {
  const ids=new Set(context.fight.friendlyPlayers||[]);
  return (context.report.masterData?.actors||[]).filter(actor=>actor.type==="Player"&&ids.has(actor.id)&&actor.name&&actor.subType&&!['Unknown','LimitBreak'].includes(actor.subType)).map(({id,name,subType})=>({id,name,job:subType}));
}

export async function fetchAllLogCastEvents({reportCode,fightId,sourceId}:{reportCode:string;fightId:number;sourceId:number}) {
  const events:LogCastEvent[]=[];let startTime:number|null=null;
  do{
    const data=await query(CAST_EVENTS_QUERY,{code:reportCode,fightIDs:[fightId],sourceID:sourceId,startTime}),page=data?.reportData?.report?.events;
    if(!page)throw new Error("キャストイベントを取得できませんでした。");
    events.push(...(page.data||[]));startTime=page.nextPageTimestamp??null;
  }while(startTime!==null);
  return events;
}

async function query(queryText:string,variables:Record<string,unknown>) {
  const accessToken=sessionStorage.getItem(STORAGE.token);
  if(!hasValidLogToken()||!accessToken)throw new Error("先に外部サービスへ接続してください。");
  const response=await fetch(API_URL,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({query:queryText,variables})}),payload=await readJson(response);
  if(response.status===401){clearLogSession();throw new Error("認証の有効期限が切れました。もう一度接続してください。")}
  if(!response.ok)throw new Error(`戦闘ログの取得に失敗しました (${response.status})。`);
  if(Array.isArray(payload.errors)&&payload.errors.length)throw new Error(payload.errors.map((item:{message?:string})=>item.message||"API error").join("\n"));
  return payload.data;
}

async function readJson(response:Response):Promise<ApiPayload> {
  try{return await response.json()}catch{return {}}
}
function requireClientId(clientId:string){if(!clientId)throw new Error("Public Client IDが設定されていません。");}
function positiveInteger(value:string|null,name:string){const parsed=Number(value);if(!Number.isInteger(parsed)||parsed<=0)throw new Error(`URLに有効な ${name} がありません。`);return parsed;}
function randomBase64Url(length:number){return base64Url(crypto.getRandomValues(new Uint8Array(length)));}
async function sha256Base64Url(value:string){return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));}
function base64Url(bytes:Uint8Array){let binary="";bytes.forEach(byte=>{binary+=String.fromCharCode(byte)});return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
