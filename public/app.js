let data;
let selected = "cmp-lidar";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const colors = { critical: "#ff6b63", high: "#f6c85d", medium: "#45d68d", low: "#45d68d" };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
async function api(path, options) { const r = await fetch(path, options); const value = await r.json(); if (!r.ok) throw new Error(value.error || "Request failed"); return value; }
const number = n => new Intl.NumberFormat("en-US").format(n);
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); }
function renderSummary() {
  $("#product-name").textContent = `${data.product.name} · ${data.product.sku}`;
  $("#readiness-score").textContent = data.summary.readiness;
  $("#score-ring").style.background = `radial-gradient(circle,#101e19 57%,transparent 59%),conic-gradient(${data.summary.readiness < 75 ? "var(--red)" : "var(--green)"} 0 ${data.summary.readiness}%,#28342f ${data.summary.readiness}%)`;
  $("#critical-count").textContent = data.summary.critical; $("#component-count").textContent = data.summary.components; $("#healthy-count").textContent = `${data.summary.sourcesHealthy}/${data.sources.length}`;
}
function renderRisks() {
  $("#risk-list").innerHTML = [...data.components].sort((a,b) => b.score-a.score).map(c => `<button class="risk-card ${c.id===selected?"active":""}" data-component="${escapeHtml(c.id)}"><i class="risk-bar" style="background:${colors[c.severity] || colors.low}"></i><div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.mpn)} · ${escapeHtml(c.assembly)}</p></div><strong>${escapeHtml(c.score)}<small>/100</small></strong></button>`).join("");
  $$('[data-component]').forEach(el => el.onclick = () => { selected=el.dataset.component; renderRisks(); renderDetail(); });
}
function drawSparkline(canvas, values) {
  const rect=canvas.getBoundingClientRect(); if(!rect.width)return;
  const dpr=window.devicePixelRatio||1,w=rect.width,h=rect.height; canvas.width=w*dpr;canvas.height=h*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const max=Math.max(...values),min=Math.min(...values),x=i=>18+i*((w-36)/(values.length-1)),y=v=>h-18-((v-min)/(max-min||1))*(h-38);
  ctx.beginPath();values.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.strokeStyle="#f45b50";ctx.lineWidth=2;ctx.stroke();
  values.forEach((v,i)=>{ctx.beginPath();ctx.arc(x(i),y(v),4,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.strokeStyle="#f45b50";ctx.lineWidth=2;ctx.stroke()});
}
function renderDetail() {
  const c=data.components.find(x=>x.id===selected), trend=data.trends[selected]||[];
  $("#detail-name").textContent=c.name; $("#detail-mpn").textContent=c.mpn; $("#detail-assembly").textContent=c.assembly; $("#detail-severity").textContent=c.severity; $("#detail-severity").className=`severity ${c.severity}`; $("#current-stock").textContent=number(c.inventory); $("#trend-chart").innerHTML='<canvas aria-label="Inventory trend"></canvas>'; drawSparkline($("#trend-chart canvas"),trend);
  $("#risk-factors").innerHTML=`<div class="factor"><span>Lead time</span><b>${escapeHtml(c.leadTimeDays)} days</b></div><div class="factor"><span>Supplier coverage</span><b>${escapeHtml(c.supplierCount)} source${c.supplierCount===1?"":"s"}</b></div><div class="factor"><span>Source confidence</span><b>${escapeHtml(Math.round(c.sourceConfidence*100))}%</b></div>`;
}
function edge(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;return `<i class="edge" style="left:${x1}%;top:${y1}%;width:${len}%;transform:rotate(${angle}deg)"></i>`}
function renderGraph() {
  const c=data.components.find(x=>x.id===selected),severity=Object.hasOwn(colors,c.severity)?c.severity:"low"; const nodes=[["product",20,50,data.product.name],["assembly",48,30,c.assembly],[`component ${severity}`,70,30,c.name],["supplier",88,17,"Northstar Components"],["supplier",88,43,"Vector Optics"],["assembly",48,70,"Compute + Power"],["component",70,70,"4 other components"]];
  $("#bom-graph").innerHTML=edge(20,50,48,30)+edge(48,30,70,30)+edge(70,30,88,17)+edge(70,30,88,43)+edge(20,50,48,70)+edge(48,70,70,70)+nodes.map(n=>`<button class="node ${n[0]}" style="left:${n[1]}%;top:${n[2]}%">${escapeHtml(n[3])}</button>`).join("");
  const alts=data.alternatives.filter(a=>a.componentId===selected); $("#graph-inspector").innerHTML=`<p class="eyebrow">SELECTED EXPOSURE</p><h3>${escapeHtml(c.name)}</h3><p>A shortage blocks <b>${escapeHtml(data.product.name)}</b> through <b>${escapeHtml(c.assembly)}</b>. There is no approved drop-in replacement.</p><p class="eyebrow">POSSIBLE ALTERNATIVES</p><ul>${alts.length?alts.map(a=>`<li>${escapeHtml(a.mpn)} · ${escapeHtml(Math.round(a.confidence*100))}% evidence confidence</li>`).join(""):"<li>No evidence-backed candidates</li>"}</ul>`;
}
function renderSources(){ const states=new Set(["healthy","suspicious","degraded","healing","recovered"]); $("#source-grid").innerHTML=data.sources.map(s=>{const state=states.has(s.state)?s.state:"suspicious";return `<article class="panel source-card"><header><div><h3>${escapeHtml(s.name)}</h3><code>${escapeHtml(s.collectorId)}</code></div><span class="state ${state}">● ${escapeHtml(state)}</span></header><div class="source-stats"><span>Freshness<b>${escapeHtml(s.freshness)}</b></span><span>Rows<b>${escapeHtml(s.rows)}</b></span><span>Evidence<b>${escapeHtml(s.kind)}</b></span></div></article>`}).join(""); }
function renderTimeline(){ const source=data.sources.find(s=>s.id==="src-controlled"),states=new Set(["degraded","healing","recovered"]); $("#continuity-id").textContent=source.collectorId; $("#timeline").innerHTML=data.healingEvents.map(e=>{const state=states.has(e.state)?e.state:"degraded";return `<article class="event ${state}"><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.detail)}</p><time>${escapeHtml(new Date(e.at).toLocaleString())}</time></article>`}).join(""); }
function render(){renderSummary();renderRisks();renderDetail();renderGraph();renderSources();renderTimeline()}
function navigate(view){ $$(".view,.nav-item").forEach(x=>x.classList.remove("active")); $(`#view-${view}`).classList.add("active"); $(`.nav-item[data-view='${view}']`).classList.add("active"); $("#page-title").textContent={command:"Command center",graph:"BOM intelligence",sources:"Source health",healing:"Self-healing lab"}[view]; }
$$('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view)); $$('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
$("#reset").onclick=async()=>{data=await api("/api/demo/reset",{method:"POST"});render();toast("Demo reset")};
$("#degrade").onclick=async()=>{try{data=await api("/api/demo/degrade",{method:"POST"});render();toast("Contract failure detected — observation quarantined")}catch(e){toast(e.message)}};
$("#heal").onclick=async()=>{try{data=await api("/api/demo/heal",{method:"POST"});render();toast("Healing started on the same collector")}catch(e){toast(e.message)}};
$("#verify").onclick=async()=>{try{data=await api("/api/demo/verify",{method:"POST"});render();toast("Recovery verified — contract restored")}catch(e){toast(e.message)}};
const stages=[
  {state:"Degraded",title:"The source changed. CANARY noticed.",detail:"Missing inventory is quarantined as a data-quality incident—not recorded as zero stock.",metric:"0 false stockouts"},
  {state:"Exposed",title:"The dependency graph reveals the impact.",detail:"Four assemblies and the Atlas Delivery Rover inherit the LiDAR shortage risk immediately.",metric:"4 assemblies"},
  {state:"Recovered",title:"The collector heals without breaking the product.",detail:"The same Collector ID returns to contract v1.0.0 and every downstream view keeps working.",metric:"96% confidence"}
];
let activeStage=0;
function selectStage(index){activeStage=(index+stages.length)%stages.length;$$('[data-stage]').forEach((el,i)=>{el.classList.toggle("active",i===activeStage);el.setAttribute("aria-selected",i===activeStage)});const s=stages[activeStage];$("#stage-state").textContent=s.state;$("#stage-state").style.color=activeStage===0?"var(--red)":activeStage===1?"var(--blue)":"var(--green)";$("#stage-title").textContent=s.title;$("#stage-detail").textContent=s.detail;$("#stage-metric").textContent=s.metric}
$$('[data-stage]').forEach((el,i)=>el.onclick=()=>selectStage(i));$("#stage-prev").onclick=()=>selectStage(activeStage-1);$("#stage-next").onclick=()=>selectStage(activeStage+1);
const signalCopy={product:["Build readiness is 76/100.","One critical component constrains the next run."],lidar:["Inventory falling faster than forecast.","617 units remain."],radio:["Supplier coverage is resilient.","4 healthy sources."],compute:["Lead time increased this week.","2 qualified sources remain."],battery:["Inventory remains within plan.","Confidence 93%."]};
$$('[data-signal]').forEach(el=>el.onclick=()=>{$$('[data-signal]').forEach(n=>n.classList.remove("active"));el.classList.add("active");const copy=signalCopy[el.dataset.signal];$(".note-a span").innerHTML=`${copy[0]}<b>${copy[1]}</b>`});
$$('[data-scroll]').forEach(el=>el.onclick=()=>document.getElementById(el.dataset.scroll).scrollIntoView({behavior:"smooth"}));
$("#mobile-menu").onclick=()=>{const open=$("#mobile-links").classList.toggle("open");$("#mobile-menu").setAttribute("aria-expanded",open)};
function showApp(){$("#landing").hidden=true;$("#app-shell").hidden=false;document.body.style.overflow="";window.scrollTo(0,0);if(data){render();renderDetail()}}
function showLanding(){$("#landing").hidden=false;$("#app-shell").hidden=true;window.scrollTo(0,0)}
$$('.enter-app').forEach(el=>el.onclick=()=>{history.pushState(null,"","#app");showApp()});
$(".back-home").onclick=()=>{history.pushState(null,"","#home");showLanding()};
window.addEventListener("hashchange",()=>location.hash==="#app"?showApp():location.hash==="#home"&&showLanding());
api("/api/dashboard").then(value=>{data=value;render();if(location.hash==="#app")showApp()}).catch(e=>toast(e.message));
