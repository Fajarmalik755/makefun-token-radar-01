"use strict";
const $=s=>document.querySelector(s);
const fmt$=n=>n>=1e9?"$"+(n/1e9).toFixed(2)+"B":n>=1e6?"$"+(n/1e6).toFixed(1)+"M":"$"+Math.round(n/1e3)+"K";
const fmtPct=n=>{if(n===null||n===undefined||!Number.isFinite(n))return '<span class="flat">—</span>';const v=(n>=0?"+":"")+n.toFixed(2)+"%";return '<span class="'+(n>0.05?"pos":n<-0.05?"neg":"flat")+'">'+v+"</span>";};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h%360;};
const initials=n=>n.replace(/[^A-Za-z0-9 ]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?";
let BOARD=[],META={};
const stars=new Set(JSON.parse(localStorage.getItem("tlr-stars-v1")||"[]"));
const saveStars=()=>localStorage.setItem("tlr-stars-v1",JSON.stringify([...stars]));
const state={q:"",cat:"",chain:"",sort:"implied",watch:false,starOnly:false};

function sparkSVG(hist){
  if(!hist||hist.length<2) return "";
  const w=640,h=74,pad=6,mn=Math.min(...hist),mx=Math.max(...hist),rg=(mx-mn)||1;
  const pts=hist.map((v,i)=>[pad+i*(w-2*pad)/(hist.length-1),h-pad-(v-mn)/rg*(h-2*pad)]);
  const line=pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area=line+" "+(w-pad)+","+(h-pad)+" "+pad+","+(h-pad);
  return '<svg class="spark" viewBox="0 0 '+w+" "+h+'" preserveAspectRatio="none" aria-hidden="true">'
    +'<polygon points="'+area+'" fill="rgba(34,211,238,.14)"/>'
    +'<polyline points="'+line+'" fill="none" stroke="#22d3ee" stroke-width="2"/>'
    +'<circle cx="'+pts[pts.length-1][0]+'" cy="'+pts[pts.length-1][1]+'" r="3.5" fill="#22d3ee"/></svg>';
}
function changeBars(r){
  const rows=[["1h",r.change1h],["1d",r.change1d],["7d",r.change7d]];
  return rows.map(([lb,v])=>{
    if(v===null||v===undefined||!Number.isFinite(v))return '<div class="meter-row"><span class="lb">'+lb+'</span><div class="meter"><i style="width:0%"></i></div><span class="vl">—</span></div>';
    const pct=Math.min(Math.abs(v)/20*100,100);
    const col=v>=0?"#34d399":"#f87171";
    return '<div class="meter-row"><span class="lb">'+lb+'</span><div class="meter"><i style="width:'+pct.toFixed(1)+"%;background:"+col+'"></i></div><span class="vl">'+(v>=0?"+":"")+v.toFixed(2)+"%</span></div>";
  }).join("");
}
function filtered(){
  let list=BOARD.filter(r=>{
    if(state.watch&&!r.watchlist)return false;
    if(state.starOnly&&!stars.has(r.slug))return false;
    if(state.cat&&r.category!==state.cat)return false;
    if(state.chain&&!r.chains.includes(state.chain))return false;
    if(state.q){
      const q=state.q.toLowerCase();
      const hay=(r.name+" "+r.category+" "+r.chains.join(" ")).toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  const s=state.sort;
  list.sort((a,b)=>s==="name"?a.name.localeCompare(b.name):s==="change7d"?b.change7d-a.change7d:s==="change1d"?b.change1d-a.change1d:s==="tvl"?b.tvl-a.tvl:s==="score"?b.score-a.score:b.implied-a.implied);
  return list;
}
function render(){
  const list=filtered();
  $("#countLine").innerHTML="Showing <b>"+list.length+"</b> of <b>"+BOARD.length+"</b> protocols"
    +(state.watch?" · watchlist only (TVL ≥ $50M)":"")+(state.starOnly?" · starred only":"")
    +(stars.size?" · "+stars.size+" starred":"");
  $("#empty").hidden=list.length>0;
  $("#rows").innerHTML=list.map((r,i)=>{
    const h=hue(r.name);
    return "<tr data-slug='"+esc(r.slug)+"'><td>"+(r.rank??i+1)+"</td>"
      +'<td><div class="proto"><span class="av" style="background:linear-gradient(135deg,hsl('+h+',70%,45%),hsl('+((h+70)%360)+',70%,45%))">'+esc(initials(r.name))+"</span>"
      +'<span><span class="nm">'+esc(r.name)+"</span>"+(r.watchlist?'<span class="wl">★ WATCHLIST</span>':"")
      +'<br><span class="sl">'+esc(r.slug)+"</span></span></div></td>"
      +'<td class="cat">'+esc(r.category)+"</td>"
      +'<td><span class="chain-pills">'+r.chains.map(c=>'<span class="pill">'+esc(c)+"</span>").join("")
      +(r.chainCount>r.chains.length?'<span class="pill">+'+(r.chainCount-r.chains.length)+"</span>":"")+"</span></td>"
      +'<td class="num"><b>'+fmt$(r.tvl)+"</b></td>"
      +'<td class="num">'+fmtPct(r.change1d)+"</td>"
      +'<td class="num">'+fmtPct(r.change7d)+"</td>"
      +'<td class="num"><b>'+fmt$(r.implied)+'</b><br><span style="font-size:11.5px;color:var(--dim)">×'+r.multiple.toFixed(2)+" peer</span></td>"
      +'<td><span class="score-cell"><span class="bar"><i style="width:'+r.score+'%"></i></span>'+r.score.toFixed(0)+"</span></td>"
      +'<td><button class="star-btn'+(stars.has(r.slug)?" on":"")+'" data-star="'+esc(r.slug)+'" aria-label="Star '+esc(r.name)+'">'+(stars.has(r.slug)?"★":"☆")+"</button></td></tr>";
  }).join("");
}
function openDetail(slug){
  const r=BOARD.find(x=>x.slug===slug);if(!r)return;
  const h=hue(r.name);
  const plan=r.plan.map(s=>"<li>"+esc(s)+"</li>").join("");
  $("#modal").innerHTML='<button class="x" id="closeBtn" aria-label="Close">✕</button>'
    +'<div class="proto"><span class="av" style="background:linear-gradient(135deg,hsl('+h+',70%,45%),hsl('+((h+70)%360)+',70%,45%))">'+esc(initials(r.name))+"</span>"
    +'<div><h2 id="dTitle">'+esc(r.name)+"</h2><div class='sl' style='color:var(--dim);font-size:13px'>"+esc(r.slug)+" · "+esc(r.category)+(r.watchlist?' · <span style="color:var(--amb)">★ Watchlist ≥ $50M</span>':"")+"</div></div></div>"
    +'<p class="desc">'+esc(r.description||"No description in the DefiLlama snapshot.")+"</p>"
    +'<div class="kv"><div><div class="k">TVL</div><div class="v">'+fmt$(r.tvl)+'</div><div class="s">'+r.chainCount+" chain"+(r.chainCount===1?"":"s")+" · "+esc(r.chains.join(", "))+(r.chainCount>r.chains.length?" +"+(r.chainCount-r.chains.length):"")+"</div></div>"
    +'<div><div class="k">Implied value</div><div class="v">'+fmt$(r.implied)+'</div><div class="s">TVL × '+r.multiple.toFixed(2)+" peer mcap/TVL</div></div>"
    +'<div><div class="k">Radar score</div><div class="v">'+r.score.toFixed(1)+' / 100</div><div class="s">TVL · peers · momentum · breadth</div></div></div>'
    +"<h3 style='margin:14px 0 4px;font-size:14px'>TVL momentum</h3>"+changeBars(r)
    +(r.history?'<h3 style="margin:14px 0 4px;font-size:14px">TVL — last ~90 days</h3>'+sparkSVG(r.history)+'<div class="cap">Daily TVL from DefiLlama, downsampled to 12 points. Earliest '+fmt$(r.history[0])+" → latest "+fmt$(r.history[r.history.length-1])+".</div>"
      :'<p class="cap" style="margin-top:10px">No daily TVL series bundled for this protocol — momentum above uses the 1h / 1d / 7d changes from the snapshot.</p>')
    +"<h3 style='margin:16px 0 4px;font-size:14px'>How to farm it</h3><ol class='plan'>"+plan+"</ol>"
    +'<p class="note">No points program is confirmed in the snapshot — check the protocol’s own docs and announcements before farming, and never deposit more than you can afford to lose.</p>'
    +'<div class="actions">'
    +(r.url?'<a class="btn primary" href="'+esc(r.url)+'" target="_blank" rel="noopener">Visit '+esc(r.name)+" ↗</a>":"")
    +'<button class="btn" id="copyBtn">Copy farm plan</button>'
    +'<button class="btn star" id="starDetail">'+(stars.has(r.slug)?"★ Starred":"☆ Star this protocol")+"</button></div>";
  $("#overlay").classList.add("open");
  document.body.style.overflow="hidden";
  $("#closeBtn").onclick=closeDetail;
  $("#copyBtn").onclick=ev=>{
    const txt="Farm plan — "+r.name+" (Token Launch Radar)\n"+r.plan.map((s,i)=>(i+1)+". "+s).join("\n")+"\n"+(r.url||"");
    const done=()=>{ev.target.textContent="Copied ✓";ev.target.classList.add("copied");};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done,()=>{});
    else{const t=document.createElement("textarea");t.value=txt;document.body.appendChild(t);t.select();try{document.execCommand("copy");done();}catch(e){}t.remove();}
  };
  $("#starDetail").onclick=ev=>{
    if(stars.has(r.slug))stars.delete(r.slug);else stars.add(r.slug);
    saveStars();ev.target.textContent=stars.has(r.slug)?"★ Starred":"☆ Star this protocol";render();
  };
}
function closeDetail(){$("#overlay").classList.remove("open");document.body.style.overflow="";}
function fillControls(){
  const cats=[...new Set(BOARD.map(r=>r.category))].sort();
  $("#cat").innerHTML='<option value="">All categories</option>'+cats.map(c=>"<option>"+esc(c)+"</option>").join("");
  const chains=[...new Set(BOARD.flatMap(r=>r.chains))].sort();
  $("#chain").innerHTML='<option value="">All chains</option>'+chains.map(c=>"<option>"+esc(c)+"</option>").join("");
  const counts={};BOARD.forEach(r=>counts[r.category]=(counts[r.category]||0)+1);
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  $("#chips").innerHTML=top.map(([c,n])=>'<button class="chip" data-cat="'+esc(c)+'" aria-pressed="false">'+esc(c)+" · "+n+"</button>").join("");
  document.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{
    const on=state.cat!==ch.dataset.cat;
    state.cat=on?ch.dataset.cat:"";$("#cat").value=state.cat;
    document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.cat===state.cat?"true":"false"));
    render();
  });
  const total=BOARD.reduce((a,r)=>a+r.tvl,0);
  const wl=BOARD.filter(r=>r.watchlist);
  $("#stats").innerHTML=
    '<div class="stat"><div class="k">Protocols, no token</div><div class="v">'+BOARD.length+'</div><div class="s">TVL ≥ $5M each</div></div>'
    +'<div class="stat"><div class="k">Watchlist ≥ $50M</div><div class="v">'+wl.length+'</div><div class="s">highest-conviction launches</div></div>'
    +'<div class="stat"><div class="k">Total TVL tracked</div><div class="v">'+fmt$(total)+'</div><div class="s">across '+BOARD.length+' protocols</div></div>'
    +'<div class="stat"><div class="k">Total implied value</div><div class="v">'+fmt$(BOARD.reduce((a,r)=>a+r.implied,0))+'</div><div class="s">sum of peer-multiple estimates</div></div>';
  $("#badges").innerHTML='<span class="badge">Snapshot <b>'+esc(META.snapshotDate||"")+'</b></span>'
    +'<span class="badge">Source <b>DefiLlama</b></span>'
    +'<span class="badge">Peer multiple (median) <b>×'+(META.globalMultiple??"")+'</b></span>'
    +(META.sealedAsOf?'<span class="badge">Sealed watchlist <b>'+esc(META.sealedAsOf)+' · '+(META.sealedWatchlist??"")+'</b></span>':"")
    +'<span class="badge">Works <b>fully offline</b></span>';
}
/* Deep links, so a view can be opened directly: #detail=<slug> opens the
   detail view, #watch=1 / #cat=<category> / #chain=<chain> / #q=<text> /
   #sort=<key> apply the filters. */
function applyHash(){
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.has("q")){state.q=h.get("q")||"";$("#q").value=state.q;}
  if(h.has("cat")){state.cat=h.get("cat")||"";$("#cat").value=state.cat;}
  if(h.has("chain")){state.chain=h.get("chain")||"";$("#chain").value=state.chain;}
  if(h.has("sort")&&["implied","tvl","score","change7d","change1d","name"].includes(h.get("sort"))){state.sort=h.get("sort");$("#sort").value=state.sort;}
  if(h.get("watch")==="1"){state.watch=true;$("#watchBtn").setAttribute("aria-pressed","true");}
  if(h.has("detail"))return h.get("detail");
  return null;
}

/* The data arrives as window.RADAR from data.js, written beside this page by `node main.ts`. */
function boot(){
  if(!window.RADAR||!Array.isArray(window.RADAR.rows))throw new Error("data.js not found");
  BOARD=window.RADAR.rows;META=window.RADAR.meta||{};
  fillControls();
  const detail=applyHash();
  document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.cat===state.cat?"true":"false"));
  render();
  if(detail)openDetail(detail);
  $("#q").addEventListener("input",e=>{state.q=e.target.value;render();});
  $("#cat").addEventListener("change",e=>{state.cat=e.target.value;
    document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",x.dataset.cat===state.cat?"true":"false"));render();});
  $("#chain").addEventListener("change",e=>{state.chain=e.target.value;render();});
  $("#sort").addEventListener("change",e=>{state.sort=e.target.value;render();});
  $("#watchBtn").addEventListener("click",e=>{state.watch=!state.watch;e.currentTarget.setAttribute("aria-pressed",state.watch);render();});
  $("#starBtn").addEventListener("click",e=>{state.starOnly=!state.starOnly;e.currentTarget.setAttribute("aria-pressed",state.starOnly);render();});
  const reset=()=>{Object.assign(state,{q:"",cat:"",chain:"",sort:"implied",watch:false,starOnly:false});
    $("#q").value="";$("#cat").value="";$("#chain").value="";$("#sort").value="implied";
    $("#watchBtn").setAttribute("aria-pressed","false");$("#starBtn").setAttribute("aria-pressed","false");
    document.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed","false"));render();};
  $("#resetBtn").addEventListener("click",reset);
  $("#emptyReset").addEventListener("click",reset);
  $("#rows").addEventListener("click",e=>{
    const star=e.target.closest("[data-star]");
    if(star){e.stopPropagation();const s=star.dataset.star;
      if(stars.has(s))stars.delete(s);else stars.add(s);saveStars();render();return;}
    const tr=e.target.closest("tr[data-slug]");if(tr)openDetail(tr.dataset.slug);
  });
  $("#overlay").addEventListener("click",e=>{if(e.target.id==="overlay")closeDetail();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDetail();});
}
try{boot();}catch(err){
  document.getElementById("countLine").textContent="Could not load data.js ("+err.message+"). Run `node main.ts` first, then serve the built out/ folder over HTTP — see README.";
}
