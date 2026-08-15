"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORE_KEY = "kingfx_enriched_trades_v2";
let trades = [];

const viewCopy = {
  overview: ["Overview", "Your trading performance at a glance."],
  journal: ["New trade", "Document the numbers, execution and psychology."],
  history: ["Trade history", "Review every decision and outcome."],
  analytics: ["Analytics", "Find the patterns behind your performance."]
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function money(value, sign = true) {
  const n = Number(value || 0);
  return `${sign && n > 0 ? "+" : ""}${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:2})}`;
}

function parseMeta(row) {
  if (row._local) return row;
  let meta = {};
  if (typeof row.notes === "string" && row.notes.startsWith("KFX2:")) {
    try { meta = JSON.parse(row.notes.slice(5)); } catch (_) { /* legacy note */ }
  }
  return {...row, ...meta, id: row.id, created_at: row.created_at, before_url: row.before_url || meta.before_url, after_url: row.after_url || meta.after_url};
}

function normalizeResult(trade) {
  const raw = String(trade.result || "").toLowerCase();
  if (["win","won","w"].includes(raw)) return "win";
  if (["loss","lost","l"].includes(raw)) return "loss";
  if (["be","break even","breakeven"].includes(raw)) return "be";
  const pnl = Number(trade.pnl);
  return pnl > 0 ? "win" : pnl < 0 ? "loss" : "be";
}

function chronological(list = trades) {
  return [...list].sort((a,b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));
}

function calculateStreaks(list) {
  const outcomes = chronological(list).map(normalizeResult).filter(r => r === "win" || r === "loss");
  const runs = {win: [], loss: []};
  let type = null, length = 0;
  outcomes.forEach(result => {
    if (result === type) length++;
    else { if (type) runs[type].push(length); type = result; length = 1; }
  });
  if (type) runs[type].push(length);
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;
  return {
    currentType: outcomes.length ? outcomes.at(-1) : null,
    current: outcomes.length ? runs[outcomes.at(-1)].at(-1) : 0,
    longestWin: Math.max(0,...runs.win), longestLoss: Math.max(0,...runs.loss),
    averageWin: avg(runs.win), averageLoss: avg(runs.loss)
  };
}

function stats() {
  const completed = trades.filter(t => ["win","loss"].includes(normalizeResult(t)));
  const wins = completed.filter(t => normalizeResult(t) === "win");
  const losses = completed.filter(t => normalizeResult(t) === "loss");
  const net = trades.reduce((sum,t)=>sum + Number(t.pnl || 0),0);
  const grossWin = wins.reduce((sum,t)=>sum + Math.max(0,Number(t.pnl || 0)),0);
  const grossLoss = Math.abs(losses.reduce((sum,t)=>sum + Math.min(0,Number(t.pnl || 0)),0));
  const winRate = completed.length ? wins.length / completed.length * 100 : 0;
  const avgRR = completed.length ? completed.reduce((sum,t)=>sum + Number(t.rr || (t.risk ? Math.abs(Number(t.pnl))/Number(t.risk) : 0)),0) / completed.length : 0;
  let equity = 0, peak = 0, maxDrawdown = 0;
  chronological(trades).forEach(t => { equity += Number(t.pnl || 0); peak = Math.max(peak,equity); maxDrawdown = Math.max(maxDrawdown,peak-equity); });
  return {completed,wins,losses,net,winRate,profitFactor:grossLoss ? grossWin/grossLoss : grossWin ? grossWin : 0,avgRR,maxDrawdown,streaks:calculateStreaks(trades)};
}

function groupPerformance(key) {
  const groups = {};
  trades.forEach(t => { const name = t[key] || "Unspecified"; groups[name] = (groups[name] || 0) + Number(t.pnl || 0); });
  return Object.entries(groups).sort((a,b)=>b[1]-a[1]);
}

function animateNumber(el, target, formatter = n => Math.round(n)) {
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const duration = reduce ? 0 : 650, start = performance.now();
  const tick = now => { const p = duration ? Math.min((now-start)/duration,1) : 1; el.textContent = formatter(target * (1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function metricCard(label, value, note, tone, icon, cls="") {
  return `<article class="metric-card" style="--tone:${tone}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong class="metric-value ${cls}">${value}</strong><span class="metric-note">${note}</span></article>`;
}

function renderOverview() {
  const s = stats();
  $("#overviewMetrics").innerHTML = [
    metricCard("Net P&L",money(s.net),`${trades.length} total trades`,s.net>=0?"#10b981":"#ef4444","↗",s.net>=0?"positive":"negative"),
    metricCard("Win rate",`${s.winRate.toFixed(1)}%`,`${s.wins.length}W / ${s.losses.length}L`,"#8b5cf6","◎"),
    metricCard("Profit factor",s.profitFactor.toFixed(2),"Gross profit ÷ gross loss","#3b82f6","◈"),
    metricCard("Max drawdown",money(-s.maxDrawdown,false),"Peak-to-trough decline","#f59e0b","↘","negative")
  ].join("");
  renderStreak(s.streaks);
  renderRecent(); renderPerformers(); drawEquity();
}

function renderStreak(streak) {
  const isWin = streak.currentType === "win", isLoss = streak.currentType === "loss";
  $("#currentStreak").textContent = streak.current;
  $("#longestWin").textContent = streak.longestWin;
  $("#longestLoss").textContent = streak.longestLoss;
  $("#averageWin").textContent = streak.averageWin.toFixed(1);
  $("#averageLoss").textContent = streak.averageLoss.toFixed(1);
  $("#streakHeadline").textContent = isWin ? `${streak.current} consecutive win${streak.current===1?"":"s"}` : isLoss ? `${streak.current} consecutive loss${streak.current===1?"":"es"}` : "Waiting for data";
  $("#streakLabel").textContent = isWin ? "Current winning streak" : isLoss ? "Current losing streak" : "Current streak";
  $("#streakAdvice").textContent = isLoss && streak.current >= 3 ? "Protect capital: consider reducing risk and review execution." : isWin && streak.current >= 3 ? "Momentum is strong. Keep risk and process consistent." : "Streaks use consecutive win/loss results by trade date.";
  $("#streakMood").textContent = isWin ? "Winning" : isLoss ? "Risk alert" : "No streak";
  $("#streakMood").className = `status-pill ${isLoss ? "negative" : ""}`;
  const ring = $("#streakRing"); ring.style.setProperty("--progress",`${Math.min(streak.current/Math.max(isWin?streak.longestWin:streak.longestLoss,1)*100,100)}%`); ring.style.setProperty("--green",isLoss?"#ef4444":"#10b981");
}

function renderRecent() {
  const rows = [...trades].sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at)).slice(0,5);
  $("#recentTrades").innerHTML = `<div class="trade-row header"><span>Pair</span><span>Date</span><span>Result</span><span>P&amp;L</span><span>R:R</span></div>` + (rows.length ? rows.map(t=>`<div class="trade-row"><span class="trade-pair">${escapeHtml(t.pair)}</span><span>${escapeHtml(t.date||"—")}</span><span class="result ${normalizeResult(t)}">${normalizeResult(t)}</span><span class="${Number(t.pnl)>=0?"positive":"negative"}">${money(t.pnl)}</span><span>${Number(t.rr||0).toFixed(2)}R</span></div>`).join("") : `<div class="history-empty">No trades yet.</div>`);
}

function renderPerformers() {
  const pairs = groupPerformance("pair").slice(0,3), max = Math.max(1,...pairs.map(([,v])=>Math.abs(v)));
  $("#bestPerformers").innerHTML = pairs.length ? pairs.map(([name,pnl])=>`<div class="performer"><div class="performer-top"><b>${escapeHtml(name)}</b><span class="${pnl>=0?"positive":"negative"}">${money(pnl)}</span></div><div class="bar"><i style="width:${Math.max(8,Math.abs(pnl)/max*100)}%"></i></div></div>`).join("") : `<div class="history-empty">Your best pairs will appear here.</div>`;
}

function drawEquity() {
  const canvas = $("#equityChart"), series = chronological(trades).map(t=>Number(t.pnl||0));
  $("#chartEmpty").style.display = series.length ? "none" : "grid";
  const rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1; canvas.width=rect.width*dpr; canvas.height=rect.height*dpr;
  const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr); ctx.clearRect(0,0,rect.width,rect.height); if(!series.length)return;
  const values=[0]; series.forEach(v=>values.push(values.at(-1)+v)); const min=Math.min(...values),max=Math.max(...values),range=max-min||1,pad=18;
  const pts=values.map((v,i)=>[pad+i/(values.length-1||1)*(rect.width-pad*2),rect.height-pad-(v-min)/range*(rect.height-pad*2)]);
  ctx.strokeStyle="rgba(148,163,184,.10)";ctx.lineWidth=1;for(let i=0;i<4;i++){let y=pad+i*(rect.height-pad*2)/3;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(rect.width-pad,y);ctx.stroke()}
  const grad=ctx.createLinearGradient(0,0,0,rect.height);grad.addColorStop(0,"rgba(16,185,129,.28)");grad.addColorStop(1,"rgba(16,185,129,0)");ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.lineTo(pts.at(-1)[0],rect.height-pad);ctx.lineTo(pts[0][0],rect.height-pad);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle="#10b981";ctx.lineWidth=2;ctx.stroke();
}

function renderHistory() {
  const query=$("#historySearch").value.toLowerCase(), result=$("#historyResult").value;
  const filtered=[...trades].sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at)).filter(t=>(result==="all"||normalizeResult(t)===result)&&`${t.pair} ${t.setup}`.toLowerCase().includes(query));
  $("#historyContainer").innerHTML=filtered.length?filtered.map(t=>`<div class="history-card"><span class="date">${escapeHtml(t.date||"—")}</span><div><b>${escapeHtml(t.pair||"—")}</b><small>${escapeHtml(t.direction||"—")} · ${escapeHtml(t.setup||"No setup")}</small></div><span class="result ${normalizeResult(t)}">${normalizeResult(t)}</span><strong class="${Number(t.pnl)>=0?"positive":"negative"}">${money(t.pnl)}</strong><span>${escapeHtml(t.session||"—")}<small>${Number(t.rr||0).toFixed(2)}R</small></span><div class="history-actions">${t.before_url||t.after_url?`<button class="mini-btn" data-image="${escapeHtml(t.after_url||t.before_url)}">▧</button>`:""}<button class="mini-btn" data-delete="${escapeHtml(t.id)}">×</button></div></div>`).join(""):`<div class="history-empty">No matching trades.</div>`;
}

function renderAnalytics() {
  const s=stats(), sample=Math.min(trades.length/20,1), consistency=Math.round(Math.max(0,Math.min(100,55+s.winRate*.35+(1-Math.min(s.maxDrawdown/Math.max(Math.abs(s.net),1),1))*10))*sample), risk=Math.round(Math.max(0,Math.min(100,75-s.streaks.averageLoss*3+(s.profitFactor>1?10:0)))*sample), execution=Math.round(Math.max(0,Math.min(100,50+s.avgRR*10+s.winRate*.25))*sample), overall=Math.round((consistency+risk+execution)/3);
  const scores=[["Trading score",overall,"#ef4444"],["Consistency",consistency,"#10b981"],["Risk management",risk,"#3b82f6"],["Execution",execution,"#8b5cf6"]];
  $("#scoreGrid").innerHTML=scores.map(([name,value,color])=>`<article class="panel score-card" style="--score:${value}%;--score-color:${color}"><span>${name}</span><div><strong>${value}</strong><span>/100</span></div><div class="score-bar"><i></i></div></article>`).join("");
  renderHeatmap();
  const st=s.streaks,bestPair=groupPerformance("pair")[0],worstPair=groupPerformance("pair").at(-1);
  $("#streakAnalysis").innerHTML=[["Current win streak",st.currentType==="win"?st.current:0],["Current loss streak",st.currentType==="loss"?st.current:0],["Highest win streak",st.longestWin],["Highest loss streak",st.longestLoss],["Average win streak",st.averageWin.toFixed(1)],["Average loss streak",st.averageLoss.toFixed(1)]].map(([l,v])=>`<div class="analysis-row"><span>${l}</span><strong>${v} trade${Number(v)===1?"":"s"}</strong></div>`).join("");
  const insights=[]; if(bestPair)insights.push(["Best pair",`${bestPair[0]} leads performance with ${money(bestPair[1])}.`]); if(worstPair&&worstPair!==bestPair)insights.push(["Pair to review",`${worstPair[0]} has contributed ${money(worstPair[1])}. Review setups before the next entry.`]); if(st.currentType==="loss"&&st.current>=3)insights.push(["Risk alert",`${st.current} losses in a row. Reduce size and perform a process review.`]); insights.push(["Expectancy signal",s.profitFactor>=1?`Your ${s.profitFactor.toFixed(2)} profit factor shows a positive payoff profile.`:"More completed trades are needed to establish a positive payoff profile."]);
  $("#insights").innerHTML=insights.slice(0,3).map(([h,p])=>`<div class="insight"><strong>${h}</strong>${p}</div>`).join("");
}

function renderHeatmap() {
  const map={}; trades.forEach(t=>{if(t.date)map[t.date]=(map[t.date]||0)+Number(t.pnl||0)}); const days=[]; const today=new Date(); for(let i=89;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const key=d.toISOString().slice(0,10),pnl=map[key];days.push(`<div class="heat-day ${pnl>0?"win":pnl<0?"loss":""}" style="--intensity:${pnl?Math.min(.95,.35+Math.abs(pnl)/1000):.1}" data-tip="${key}: ${pnl===undefined?"No trade":money(pnl)}"></div>`)} $("#heatmap").innerHTML=days.join("");
}

function renderAll(){renderOverview();renderHistory();renderAnalytics()}

async function uploadImage(file) {
  if (!file || !window.supabase) return null;
  const safe=file.name.replace(/[^a-z0-9._-]/gi,"-"); const path=`${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${safe}`;
  const {error}=await supabase.storage.from("trade-images").upload(path,file); if(error)throw error;
  return supabase.storage.from("trade-images").getPublicUrl(path).data.publicUrl;
}

function localTrades(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||"[]")}catch{return[]}}
function saveLocal(list){localStorage.setItem(STORE_KEY,JSON.stringify(list))}

async function loadTrades() {
  const locals=localTrades();
  if(!window.supabase){trades=locals;setConnection(false);renderAll();return}
  const {data,error}=await supabase.from("trades").select("*").order("created_at",{ascending:false});
  if(error){console.warn(error);trades=locals;setConnection(false);toast("Offline mode: showing trades saved on this device.");}
  else {const remote=(data||[]).map(parseMeta);const ids=new Set(remote.map(t=>String(t.id)));trades=[...remote,...locals.filter(t=>!ids.has(String(t.id)))];setConnection(true)}
  renderAll();
}

async function saveTrade(event) {
  event.preventDefault(); const button=$("#saveBtn"); button.disabled=true; button.textContent="Saving…"; $("#status").textContent="Uploading media and saving your trade.";
  const values={date:$("#date").value,pair:$("#pair").value.trim().toUpperCase(),direction:$("#direction").value,result:$("#result").value,risk:Number($("#risk").value),pnl:Number($("#pnl").value),rr:Number($("#rr").value||0),session:$("#session").value,setup:$("#setup").value.trim(),emotion:$("#emotion").value,confidence:Number($("#confidence").value),journal_notes:$("#notes").value.trim()};
  if((values.result==="win"&&values.pnl<0)||(values.result==="loss"&&values.pnl>0)){toast("Result and P&L do not agree.");button.disabled=false;button.textContent="Save trade";return}
  try{
    let before=null,after=null; try{[before,after]=await Promise.all([uploadImage($("#beforeImg").files[0]),uploadImage($("#afterImg").files[0])])}catch(e){console.warn(e);toast("Images could not upload; the trade will still be saved.")}
    const meta={...values,before_url:before,after_url:after}; let saved=null;
    if(window.supabase){const payload={date:values.date,pair:values.pair,risk:values.risk,before_url:before,after_url:after,notes:`KFX2:${JSON.stringify(meta)}`};const {data,error}=await supabase.from("trades").insert([payload]).select().single();if(!error)saved=parseMeta(data);else console.warn(error)}
    if(!saved){saved={...meta,id:`local-${Date.now()}`,_local:true,created_at:new Date().toISOString()};const local=localTrades();local.unshift(saved);saveLocal(local);setConnection(false)}
    trades.unshift(saved);event.target.reset();$("#date").valueAsDate=new Date();$("#confidenceValue").textContent="7/10";resetPreviews();renderAll();showView("overview");toast("Trade saved. Your analytics are updated.");
  }catch(error){console.error(error);toast("Trade could not be saved. Please try again.")}finally{button.disabled=false;button.textContent="Save trade";$("#status").textContent=""}
}

async function deleteTrade(id){if(!confirm("Delete this trade? This cannot be undone."))return;const trade=trades.find(t=>String(t.id)===String(id));if(trade&&!trade._local&&window.supabase){const {error}=await supabase.from("trades").delete().eq("id",id);if(error){toast("Delete failed. Check your Supabase delete policy.");return}}const local=localTrades().filter(t=>String(t.id)!==String(id));saveLocal(local);trades=trades.filter(t=>String(t.id)!==String(id));renderAll();toast("Trade deleted.")}

function showView(name){const valid=viewCopy[name]?name:"overview";$$('.view').forEach(v=>v.classList.toggle("active",v.id===`${valid}View`));$$('.nav-item').forEach(n=>n.classList.toggle("active",n.dataset.view===valid));$("#pageTitle").textContent=viewCopy[valid][0];$("#pageSubtitle").textContent=viewCopy[valid][1];$("#sidebar").classList.remove("open");history.replaceState(null,"",`#${valid}`);if(valid==="overview")setTimeout(drawEquity,20);if(valid==="analytics")renderAnalytics();window.scrollTo({top:0,behavior:"smooth"})}
function setConnection(live){$("#syncState").classList.toggle("offline",!live);$("#syncState").lastChild.textContent=live?" Live":" Local"}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove("show"),3200)}
function preview(input,target){const file=input.files[0];if(!file)return;const url=URL.createObjectURL(file);target.innerHTML=`<img src="${url}" alt="Selected screenshot">`}
function resetPreviews(){$("#beforePreview").textContent="Drop or choose an image";$("#afterPreview").textContent="Drop or choose an image"}

$$('.nav-item').forEach(btn=>btn.addEventListener("click",()=>showView(btn.dataset.view)));
$$('[data-open-journal]').forEach(btn=>btn.addEventListener("click",()=>showView("journal")));
$$('[data-view-link]').forEach(btn=>btn.addEventListener("click",()=>showView(btn.dataset.viewLink)));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#confidence").addEventListener("input",e=>$("#confidenceValue").textContent=`${e.target.value}/10`);
$("#beforeImg").addEventListener("change",e=>preview(e.target,$("#beforePreview")));$("#afterImg").addEventListener("change",e=>preview(e.target,$("#afterPreview")));
$("#tradeForm").addEventListener("submit",saveTrade);$("#tradeForm").addEventListener("reset",()=>setTimeout(resetPreviews));
$("#historySearch").addEventListener("input",renderHistory);$("#historyResult").addEventListener("change",renderHistory);
$("#historyContainer").addEventListener("click",e=>{const del=e.target.closest("[data-delete]"),img=e.target.closest("[data-image]");if(del)deleteTrade(del.dataset.delete);if(img){$("#modalImage").src=img.dataset.image;$("#imageModal").classList.add("open")}});
$("#imageModal").addEventListener("click",e=>{if(e.target.id==="imageModal"||e.target.classList.contains("modal-close"))$("#imageModal").classList.remove("open")});
addEventListener("resize",()=>{if($("#overviewView").classList.contains("active"))drawEquity()});
$("#date").valueAsDate=new Date();showView(location.hash.slice(1)||"overview");loadTrades();
