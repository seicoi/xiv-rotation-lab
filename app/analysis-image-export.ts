type DpsPoint={damageEvent:number;dps:number};
type DamageItem={name:string;value:number};
type SimulationSummary={samples:number[];minimum:number;median:number;mean:number;maximum:number};

const WIDTH=1800,HEIGHT=620,BACKGROUND="#0a0f0c",PANEL="#111814",LINE="#263740",BLUE="#58bfff",MUTED="#8f9991",TEXT="#eef4ef";

function canvas(){const element=document.createElement("canvas");element.width=WIDTH;element.height=HEIGHT;return element}
function context(element:HTMLCanvasElement){const value=element.getContext("2d");if(!value)throw new Error("canvas unavailable");value.textBaseline="middle";return value}
function font(ctx:CanvasRenderingContext2D,size:number,weight=400){ctx.font=`${weight} ${size}px "Noto Sans JP", Arial, sans-serif`}
function panel(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number){ctx.fillStyle=PANEL;ctx.strokeStyle=LINE;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,width,height,18);ctx.fill();ctx.stroke()}
function label(ctx:CanvasRenderingContext2D,value:string,x:number,y:number){font(ctx,18,700);ctx.fillStyle=BLUE;ctx.fillText(value.toUpperCase(),x,y)}
function safeName(value:string){return value.replace(/[\\/:*?"<>|]/g,"-").trim()||"rotation"}
function save(element:HTMLCanvasElement,fileName:string){element.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),0)},"image/png")}
function header(ctx:CanvasRenderingContext2D,job:string,sheetName:string,title:string){label(ctx,"XIV ROTATION LAB",44,42);font(ctx,34,700);ctx.fillStyle=TEXT;ctx.fillText(title,44,82);font(ctx,18,400);ctx.fillStyle=MUTED;ctx.fillText(`${job} · ${sheetName}`,WIDTH-44-ctx.measureText(`${job} · ${sheetName}`).width,82)}
function grid(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number){ctx.strokeStyle=LINE;ctx.lineWidth=2;for(let index=1;index<5;index++){const lineY=y+height*index/5;ctx.beginPath();ctx.moveTo(x,lineY);ctx.lineTo(x+width,lineY);ctx.stroke()}}

export function exportDpsSummaryImage(data:{job:string;sheetName:string;locale:"ja"|"en";dps:number;simulatedDps:number;iterations:number;rows:DpsPoint[];breakdown:DamageItem[]}){
  const element=canvas(),ctx=context(element),ja=data.locale==="ja";
  ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,WIDTH,HEIGHT);header(ctx,data.job,data.sheetName,ja?"DPS分析":"DPS analysis");
  panel(ctx,40,120,350,450);panel(ctx,414,120,820,450);panel(ctx,1258,120,502,450);
  label(ctx,"DPS",72,158);font(ctx,76,700);ctx.fillStyle=TEXT;ctx.fillText(Math.round(data.dps).toLocaleString(),72,238);
  font(ctx,20,400);ctx.fillStyle=MUTED;ctx.fillText(`${ja?"シミュDPS":"Sim DPS"} ${Math.round(data.simulatedDps).toLocaleString()}`,72,310);ctx.fillText(`${data.iterations.toLocaleString()} ${ja?"試行":"runs"}`,72,344);
  label(ctx,ja?"DPS推移":"DPS TREND",446,158);const chart={x:454,y:196,width:742,height:326};grid(ctx,chart.x,chart.y,chart.width,chart.height);
  const points=data.rows.filter(row=>row.damageEvent>0&&Number.isFinite(row.dps));if(points.length){const maxTime=Math.max(...points.map(row=>row.damageEvent),1),maxDps=Math.max(...points.map(row=>row.dps),1),coords=points.map(row=>[chart.x+chart.width*row.damageEvent/maxTime,chart.y+chart.height-chart.height*row.dps/maxDps] as const),gradient=ctx.createLinearGradient(0,chart.y,0,chart.y+chart.height);gradient.addColorStop(0,"rgba(88,191,255,.32)");gradient.addColorStop(1,"rgba(88,191,255,0)");ctx.beginPath();ctx.moveTo(coords[0][0],chart.y+chart.height);coords.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(coords.at(-1)![0],chart.y+chart.height);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();ctx.beginPath();coords.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=BLUE;ctx.lineWidth=4;ctx.stroke()}
  label(ctx,ja?"アクション別ダメージ":"DAMAGE BY ACTION",1290,158);const total=data.breakdown.reduce((sum,item)=>sum+item.value,0),top=data.breakdown.slice(0,7),max=Math.max(...top.map(item=>item.value),1);top.forEach((item,index)=>{const y=208+index*48;font(ctx,17,600);ctx.fillStyle=TEXT;const name=item.name.length>18?`${item.name.slice(0,17)}…`:item.name;ctx.fillText(name,1290,y);font(ctx,16,700);ctx.fillStyle=BLUE;const share=total?Math.round(item.value/total*100):0;ctx.textAlign="right";ctx.fillText(`${share}%`,1724,y);ctx.textAlign="left";ctx.fillStyle="#1d2a31";ctx.fillRect(1290,y+18,434,8);ctx.fillStyle=BLUE;ctx.fillRect(1290,y+18,434*item.value/max,8)});
  save(element,`${safeName(data.job)}-${safeName(data.sheetName)}-dps.png`);
}

export function exportSimulationDpsImage(data:{job:string;sheetName:string;locale:"ja"|"en";iterations:number;simulation:SimulationSummary}){
  const element=canvas(),ctx=context(element),ja=data.locale==="ja",values=data.simulation.samples.filter(Number.isFinite);
  ctx.fillStyle=BACKGROUND;ctx.fillRect(0,0,WIDTH,HEIGHT);header(ctx,data.job,data.sheetName,ja?"シミュDPS分布":"Simulated DPS distribution");
  panel(ctx,40,120,1260,450);panel(ctx,1324,120,436,450);label(ctx,"SIMULATED DPS",72,158);font(ctx,18,400);ctx.fillStyle=MUTED;ctx.fillText(`${data.iterations.toLocaleString()} ${ja?"試行":"runs"}`,1150,158);
  const plot={x:76,y:198,width:1188,height:320};grid(ctx,plot.x,plot.y,plot.width,plot.height);
  if(values.length){const minimum=Math.min(...values),maximum=Math.max(...values),span=Math.max(maximum-minimum,1),binCount=Math.min(40,Math.max(12,Math.round(Math.sqrt(values.length)))),bins=new Array(binCount).fill(0);values.forEach(value=>{const index=Math.min(binCount-1,Math.floor((value-minimum)/span*binCount));bins[index]++});const tallest=Math.max(...bins,1),barWidth=plot.width/binCount;bins.forEach((count,index)=>{const height=plot.height*count/tallest;ctx.fillStyle="rgba(88,191,255,.30)";ctx.fillRect(plot.x+index*barWidth+2,plot.y+plot.height-height,Math.max(2,barWidth-4),height)});const mean=values.reduce((sum,value)=>sum+value,0)/values.length,variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length,deviation=Math.max(Math.sqrt(variance),span/1000),peak=1/(deviation*Math.sqrt(2*Math.PI));ctx.beginPath();for(let pixel=0;pixel<=plot.width;pixel++){const value=minimum+span*pixel/plot.width,density=Math.exp(-.5*((value-mean)/deviation)**2)/(deviation*Math.sqrt(2*Math.PI)),x=plot.x+pixel,y=plot.y+plot.height-plot.height*.88*density/peak;if(pixel)ctx.lineTo(x,y);else ctx.moveTo(x,y)}ctx.strokeStyle=BLUE;ctx.lineWidth=4;ctx.stroke();font(ctx,16,400);ctx.fillStyle=MUTED;ctx.fillText(Math.round(minimum).toLocaleString(),plot.x,544);ctx.textAlign="right";ctx.fillText(Math.round(maximum).toLocaleString(),plot.x+plot.width,544);ctx.textAlign="left"}
  const stats=[[ja?"最小値":"Minimum",data.simulation.minimum],[ja?"中央値":"Median",data.simulation.median],[ja?"平均値":"Mean",data.simulation.mean],[ja?"最大値":"Maximum",data.simulation.maximum]] as const;stats.forEach(([name,value],index)=>{const y=166+index*94;font(ctx,17,600);ctx.fillStyle=MUTED;ctx.fillText(name,1360,y);font(ctx,34,700);ctx.fillStyle=index===2?BLUE:TEXT;ctx.fillText(Math.round(value).toLocaleString(),1360,y+38)});
  save(element,`${safeName(data.job)}-${safeName(data.sheetName)}-sim-dps.png`);
}
