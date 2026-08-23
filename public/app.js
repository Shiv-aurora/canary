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
  const liveSources=data.sources.filter(source=>source.kind==="live"),healthyLiveSources=liveSources.filter(source=>["healthy","recovered"].includes(source.state));
  $("#critical-count").textContent = data.summary.critical; $("#component-count").textContent = data.summary.components; $("#healthy-count").textContent = `${healthyLiveSources.length}/${liveSources.length}`;
  const mode=data.meta?.mode==="mixed"?`${number(data.meta.liveObservationCount)} live observations`:data.meta?.brightDataConfigured?"Bright Data ready · awaiting first run":"Seeded intelligence · live setup pending";
  $("#data-mode").lastChild.textContent=` ${mode}`; $("#data-mode").classList.toggle("live",data.meta?.mode==="mixed");
  const currentProducts=new Set((data.observations||[]).filter(item=>item.provenance?.kind==="live").map(item=>item.provenance?.url).filter(Boolean)).size;
  if($("#landing-product-count")) $("#landing-product-count").textContent=`${number(currentProducts)} products`;
  if($("#landing-live-count")) $("#landing-live-count").textContent=`${number(currentProducts)} current products`;
  if($("#landing-observation-count")) $("#landing-observation-count").textContent=`${number(data.meta?.liveObservationCount||0)} live observations`;
  const previewCards=$$(".stat-card"),previewProducts=previewCards.find(card=>card.querySelector("span")?.textContent==="Live products"),previewSources=previewCards.find(card=>card.querySelector("span")?.textContent==="Healthy sources");
  if(previewProducts) previewProducts.querySelector("strong").textContent=number(currentProducts);
  if(previewSources){previewSources.querySelector("strong").textContent=`${healthyLiveSources.length}/${liveSources.length}`;previewSources.querySelector("small").textContent="Live collectors healthy now";}
  const liveObservations=(data.observations||[]).filter(item=>item.provenance?.kind==="live");
  [{key:"robotshop",sourceId:"src-robotshop-us",country:"United States"},{key:"botland",sourceId:"src-botland-pl",country:"Poland"}].forEach(({key,sourceId,country})=>{
    const source=data.sources.find(item=>item.id===sourceId),count=new Set(liveObservations.filter(item=>item.sourceId===sourceId).map(item=>item.provenance?.url).filter(Boolean)).size,state=source?.state||"suspicious";
    if($(`#landing-${key}-count`)) $(`#landing-${key}-count`).textContent=`${number(count)} current`;
    if($(`#landing-${key}-state`)) $(`#landing-${key}-state`).textContent=state;
    if($(`#landing-${key}-globe-state`)) $(`#landing-${key}-globe-state`).textContent=`${country} · ${number(count)} current · ${state}`;
    [$(`#landing-${key}-card`),$(`#landing-${key}-globe`)].filter(Boolean).forEach(element=>{element.classList.remove("healthy","recovered","degraded","healing","suspicious");element.classList.add(state)});
  });
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
  renderImpact(c);
}
function renderImpact(c) {
  const alternatives=data.alternatives.filter(item=>item.componentId===c.id);
  $("#impact-component").textContent=c.name; $("#impact-assembly").textContent=c.assembly;
  $("#impact-title").textContent=`The ${c.assembly.toLowerCase()}—and the entire rover build.`;
  $("#impact-summary").textContent=`A shortage in ${c.name} blocks ${c.assembly}, which puts the next ${data.product.name} production run at risk.`;
  $("#impact-alternatives").textContent=alternatives.length?`${alternatives.length} possible alternative${alternatives.length===1?"":"s"} require engineering review`:"No evidence-backed alternative is currently available";
}
function renderSources(){ const states=new Set(["healthy","suspicious","degraded","healing","recovered"]),liveSources=data.sources.filter(source=>source.kind==="live"); $("#source-grid").innerHTML=liveSources.map(s=>{const state=s.hasRun?(states.has(s.state)?s.state:"suspicious"):"ready",region=s.region?`${s.region.country} · ${s.region.market}`:"Unknown region",canRun=data.meta?.brightDataConfigured;return `<article class="panel source-card"><header><div><h3>${escapeHtml(s.name)}</h3><code>${escapeHtml(s.collectorId)}</code></div><span class="state ${state}">● ${escapeHtml(state)}</span></header><p class="source-region">${escapeHtml(region)}</p><div class="source-stats"><span>Local activity<b>${escapeHtml(s.hasRun?s.freshness:"No run yet")}</b></span><span>Configured products<b>${escapeHtml(s.configuredInputs||0)}</b></span><span>Validated rows<b>${escapeHtml(s.hasRun?s.rows:"—")}</b></span></div>${s.errors?.length?`<p class="source-error">${escapeHtml(s.errors[0])}</p>`:""}${canRun?`<button class="source-run" data-run-collector="${escapeHtml(s.key)}">Collect now</button>`:""}</article>`}).join(""); $$('[data-run-collector]').forEach(button=>button.onclick=()=>runCollector(button)); }
const groupCounts=(items,keyFor)=>items.reduce((counts,item)=>{const key=keyFor(item)||"Unknown";counts[key]=(counts[key]||0)+1;return counts},{});
function renderSupplyCharts(rows,isLive){
  const sourceNames=Object.fromEntries(data.sources.map(source=>[source.id,source.name])),componentNames=Object.fromEntries(data.components.map(component=>[component.id,component.name]));
  const supplierCounts=groupCounts(rows,item=>sourceNames[item.sourceId]||item.supplierId),supplierEntries=Object.entries(supplierCounts),maxSupplier=Math.max(1,...supplierEntries.map(([,count])=>count));
  $("#coverage-total").textContent=`${number(rows.length)} ${isLive?"live":"configured"}`;
  $("#coverage-chart").innerHTML=supplierEntries.map(([label,count])=>`<div class="bar-row"><div><span>${escapeHtml(label)}</span><b>${count}</b></div><i><em style="width:${Math.round(count/maxSupplier*100)}%"></em></i></div>`).join("");
  const componentCounts=groupCounts(rows,item=>componentNames[item.componentId]||item.componentId),componentEntries=Object.entries(componentCounts).sort((a,b)=>b[1]-a[1]),palette=["#2878ff","#35b46f","#f5a623","#8c6ff7","#f45b50"],total=Math.max(1,rows.length);let cursor=0;
  const stops=componentEntries.map(([,count],index)=>{const start=cursor;cursor+=count/total*100;return `${palette[index%palette.length]} ${start}% ${cursor}%`});
  $("#component-donut").style.background=componentEntries.length?`conic-gradient(${stops.join(",")})`:"#edf2f6";$("#component-donut").innerHTML=`<span><b>${rows.length}</b>${isLive?"live rows":"targets"}</span>`;
  $("#component-legend").innerHTML=componentEntries.map(([label,count],index)=>`<div><i style="background:${palette[index%palette.length]}"></i><span>${escapeHtml(label)}</span><b>${count}</b></div>`).join("");
  const regionCounts=groupCounts(rows,item=>item.provenance?.region),regionEntries=Object.entries(regionCounts),maxRegion=Math.max(1,...regionEntries.map(([,count])=>count));
  $("#region-chart").innerHTML=regionEntries.map(([label,count],index)=>`<div><b>${count}</b><i><em style="height:${Math.max(10,Math.round(count/maxRegion*100))}%;background:${palette[index%palette.length]}"></em></i><span>${escapeHtml(label)}</span></div>`).join("");
  const configured=(data.configuredCatalog||[]).length,liveProducts=new Set((data.observations||[]).filter(item=>item.provenance?.kind==="live").map(item=>item.provenance?.url)).size,latestRun=(data.ingestionRuns||[]).find(run=>run.status==="complete"),validated=latestRun?.validRows||0,pipeline=[{label:"Configured",value:configured,color:"#2878ff"},{label:"Observed",value:liveProducts,color:"#f5a623"},{label:"Validated",value:validated,color:"#35b46f"}],pipelineMax=Math.max(1,configured,liveProducts,validated);
  $("#pipeline-chart").innerHTML=pipeline.map(item=>`<div class="pipeline-step"><div><span>${item.label}</span><b>${item.value}</b></div><i><em style="width:${Math.round(item.value/pipelineMax*100)}%;background:${item.color}"></em></i></div>`).join("");
}
function renderCatalog(){
  const sourceNames=Object.fromEntries(data.sources.map(source=>[source.id,source.name]));
  const latest=new Map();
  (data.observations||[]).filter(item=>item.provenance?.kind==="live").sort((a,b)=>new Date(b.collectedAt)-new Date(a.collectedAt)).forEach(item=>{const key=item.provenance?.url||item.id;if(!latest.has(key))latest.set(key,item)});
  const liveRows=[...latest.values()],isLive=liveRows.length>0,rows=isLive?liveRows:(data.configuredCatalog||[]),notice=$("#source-notice");
  $("#supplier-mode-label").textContent=isLive?"REAL COLLECTION EVIDENCE":"CONFIGURED COLLECTION COVERAGE";
  $("#supplier-mode-copy").textContent=isLive?"These products were collected from regional supplier websites and validated by CANARY.":"These are the real product targets configured for CANARY's Bright Data collectors. Run data is shown only after collection and validation.";
  notice.hidden=isLive;notice.innerHTML=isLive?"":`<strong>Local demo baseline</strong><span>This environment has not run Bright Data yet, so CANARY is showing ${number(rows.length)} configured product targets—not invented prices, stock, or live observations.</span>`;
  $("#catalog-eyebrow").textContent=isLive?"WHAT SUPPLIERS ARE REPORTING NOW":"WHAT CANARY IS CONFIGURED TO MONITOR";$("#catalog-title").textContent=isLive?"Live hardware products":"Configured hardware products";
  $("#catalog-count").textContent=`${number(rows.length)} ${isLive?"current":"configured"} products`;
  $("#catalog-list").innerHTML=rows.length?rows.map(item=>{const price=item.price?new Intl.NumberFormat("en-US",{style:"currency",currency:item.price.currency}).format(item.price.amount):isLive?"—":"Pending live run",availability=isLive?String(item.availability||"unknown").replaceAll("_"," "):"awaiting collection",meta=item.mpn||item.manufacturer||"Product target";return `<tr><td><a href="${escapeHtml(item.provenance.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title||item.mpn||"Untitled product")}</a><small>${escapeHtml(meta)}</small></td><td>${escapeHtml(sourceNames[item.sourceId]||item.supplierId)}</td><td>${escapeHtml(price)}</td><td><span class="availability ${isLive?escapeHtml(item.availability||"unknown"):"configured"}">● ${escapeHtml(availability)}</span>${item.inventory!=null?`<small>${number(item.inventory)} units</small>`:""}</td><td>${escapeHtml(item.provenance.region||"—")}</td></tr>`}).join(""):'<tr><td colspan="5" class="catalog-empty">No configured product targets were found.</td></tr>';
  renderSupplyCharts(rows,isLive);
}
function renderRuns(){ $("#persistence-mode").textContent=`${data.meta?.persistence||"unknown"} persistence`; const runs=data.ingestionRuns||[]; $("#run-list").innerHTML=runs.length?runs.map(run=>`<article class="run-row"><span class="run-status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span><div><b>${escapeHtml(run.sourceId)}</b><small>${escapeHtml(run.snapshotId||run.id)} · ${escapeHtml(run.region?.country||"—")}</small></div><strong>${escapeHtml(run.validRows||0)}/${escapeHtml(run.rows||0)} rows</strong><time>${escapeHtml(new Date(run.finishedAt||run.startedAt).toLocaleString())}</time></article>`).join(""):`<div class="empty-run"><b>No live collection has run in this local environment.</b><span>The configured catalog and coverage charts above show the 24 real collection targets. Live snapshots and validation results will appear here after Bright Data runs.</span></div>`; }
async function runCollector(button){button.disabled=true;button.textContent="Collecting…";try{await api("/api/collectors/run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collectorKey:button.dataset.runCollector})});data=await api("/api/dashboard");render();toast("Live observation collected and persisted")}catch(e){toast(e.message)}finally{button.disabled=false;button.textContent="Collect now"}}
function renderTimeline(){
  const source=data.sources.find(s=>s.id==="src-botland-pl"),events=data.healingEvents.filter(event=>event.sourceId===source?.id),states=new Set(["degraded","healing","recovered"]),degraded=events.find(event=>event.state==="degraded"),recovered=[...events].reverse().find(event=>event.state==="recovered"),snapshot=detail=>(detail||"").match(/j_[a-z0-9]+/i)?.[0];
  $("#continuity-id").textContent=source?.collectorId||events[0]?.collectorId||"—";
  $("#recovery-row-count").textContent=recovered?.detail.match(/\d+\/\d+/)?.[0]||"Verified";
  $("#degraded-snapshot").textContent=snapshot(degraded?.detail)||"Invalid snapshot detected";
  $("#recovered-snapshot").textContent=snapshot(recovered?.detail)||"Valid snapshot restored";
  $("#timeline").innerHTML=events.map(event=>{const state=states.has(event.state)?event.state:"degraded";return `<article class="event ${state}"><span>${escapeHtml(state)}</span><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.detail)}</p><time>${escapeHtml(new Date(event.at||event.startedAt).toLocaleString())}</time></article>`}).join("");
}
function render(){renderSummary();renderRisks();renderDetail();renderSources();renderCatalog();renderRuns();renderTimeline()}
function navigate(view){ const target=$(`#view-${view}`),nav=$(`.nav-item[data-view='${view}']`); if(!target||!nav)return; $$(".view,.nav-item").forEach(x=>x.classList.remove("active")); target.classList.add("active"); nav.classList.add("active"); $("#page-title").textContent={command:"Dashboard",sources:"Supplier Data",healing:"How CANARY Recovers"}[view]; window.scrollTo(0,0); }
$$('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
$$('[data-impact]').forEach(button=>button.onclick=()=>$("#production-impact").scrollIntoView({behavior:"smooth",block:"center"}));
const stages=[
  {state:"Degraded",title:"The field disappeared. CANARY noticed.",detail:"The invalid manufacturer field was treated as a source-health incident, never as trusted supply data.",metric:"0 false facts"},
  {state:"Healing",title:"Bright Data repaired the collector in place.",detail:"The planner, code-fixer, preview runner, and fulfillment validator completed without replacing the collector.",metric:"Same c_* ID"},
  {state:"Recovered",title:"The stable contract passed again.",detail:"Manufacturer returned as Arduino and the complete Botland catalog passed post-heal validation.",metric:"12 / 12 rows"}
];
let activeStage=0;
function selectStage(index){activeStage=(index+stages.length)%stages.length;$$('[data-stage]').forEach((el,i)=>{el.classList.toggle("active",i===activeStage);el.setAttribute("aria-selected",i===activeStage)});const s=stages[activeStage];$("#stage-state").textContent=s.state;$("#stage-state").style.color=activeStage===0?"var(--red)":activeStage===1?"var(--blue)":"var(--green)";$("#stage-title").textContent=s.title;$("#stage-detail").textContent=s.detail;$("#stage-metric").textContent=s.metric}
$$('[data-stage]').forEach((el,i)=>el.onclick=()=>selectStage(i));$("#stage-prev").onclick=()=>selectStage(activeStage-1);$("#stage-next").onclick=()=>selectStage(activeStage+1);
const signalCopy={product:["Build readiness is 76/100.","One critical component constrains the next run."],lidar:["Inventory falling faster than forecast.","617 units remain."],radio:["Supplier coverage is resilient.","4 healthy sources."],compute:["Lead time increased this week.","2 qualified sources remain."],battery:["Inventory remains within plan.","Confidence 93%."]};
$$('[data-signal]').forEach(el=>el.onclick=()=>{$$('[data-signal]').forEach(n=>n.classList.remove("active"));el.classList.add("active");const copy=signalCopy[el.dataset.signal];$(".note-a span").innerHTML=`${copy[0]}<b>${copy[1]}</b>`});
$$('[data-scroll]').forEach(el=>el.onclick=()=>document.getElementById(el.dataset.scroll).scrollIntoView({behavior:"smooth"}));
$("#mobile-menu").onclick=()=>{const open=$("#mobile-links").classList.toggle("open");$("#mobile-menu").setAttribute("aria-expanded",open)};
let contextShown=false;
function openContext(){const modal=$("#context-modal");modal.hidden=false;document.body.style.overflow="hidden";setTimeout(()=>$("#context-start").focus(),0)}
function closeContext(){$("#context-modal").hidden=true;document.body.style.overflow=""}
function showApp(){$("#landing").hidden=true;$("#app-shell").hidden=false;document.body.style.overflow="";window.scrollTo(0,0);if(data){render();renderDetail()}if(!contextShown){contextShown=true;openContext()}}
function showLanding(){closeContext();contextShown=false;$("#landing").hidden=false;$("#app-shell").hidden=true;window.scrollTo(0,0)}
$$('[data-close-context]').forEach(button=>button.onclick=closeContext);$("#context-start").onclick=closeContext;window.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("#context-modal").hidden)closeContext()});
$$('.enter-app').forEach(el=>el.onclick=()=>{history.pushState(null,"","#app");showApp();navigate("command")});
$$('[data-open-view]').forEach(el=>el.onclick=()=>{history.pushState(null,"","#app");showApp();navigate(el.dataset.openView)});
$(".back-home").onclick=()=>{history.pushState(null,"","#home");showLanding()};
window.addEventListener("hashchange",()=>location.hash==="#app"?showApp():location.hash==="#home"&&showLanding());
api("/api/dashboard").then(value=>{data=value;render();if(location.hash==="#app")showApp()}).catch(e=>toast(e.message));
