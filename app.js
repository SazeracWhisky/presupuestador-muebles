
(() => {
"use strict";
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(v)||0);
let records=window.readMaterials();
let selected={family:"",variant:"",thickness:"",recordId:""};
let dividers=[{id:uid(),position:470}];
let shelves=[
  {id:uid(),section:0,height:350},
  {id:uid(),section:1,height:235},
  {id:uid(),section:1,height:470}
];
let view={yaw:-0.72,pitch:0.42,zoom:1,panX:0,panY:0};
let canvas,ctx,drag=false,dragMode="rotate",last={x:0,y:0},activePointers=new Map(),pinchDistance=0;

function uid(){return window.uid?window.uid():`${Date.now()}-${Math.random()}`;}
function family(){return window.getCatalog(selected.family)}
function rec(){return records.find(r=>r.id===selected.recordId)||null}
function materialVariantRequired(){return !!family()?.variants.length}
function setOptions(select,items,placeholder,value=""){
  select.replaceChildren(new Option(placeholder,"",true,!value));
  items.forEach(x=>select.add(new Option(x.label,x.value)));
  if(value!=="" && value!=null)select.value=String(value);
}
function refreshRecords(){records=window.readMaterials();}

function initMaterialSelectors(){
  setOptions($("materialSelect"),window.MATERIAL_CATALOG.map(m=>({label:m.label,value:m.id})),"Seleccionar material...");
  $("materialSelect").addEventListener("change",()=>{
    selected.family=$("materialSelect").value; selected.variant=""; selected.thickness=""; selected.recordId="";
    renderVariant(); renderThickness(); renderSelected(); updateAll();
  });
  $("variantSelect").addEventListener("change",()=>{
    selected.variant=$("variantSelect").value; selected.thickness=""; selected.recordId="";
    renderThickness(); renderSelected(); updateAll();
  });
  $("thicknessSelect").addEventListener("change",()=>{
    selected.thickness=String($("thicknessSelect").value||""); refreshRecords();
    const r=records.find(x=>x.materialId===selected.family&&(x.variant||"")===selected.variant&&Number(x.thickness)===Number(selected.thickness));
    selected.recordId=r?.id||"";
    renderSelected(); updateAll();
  });
}
function renderVariant(){
  const f=family(), wrap=$("variantWrap"), sel=$("variantSelect");
  if(!f){wrap.classList.add("hidden");sel.disabled=true;setOptions(sel,[],"Seleccionar color / variante...");return;}
  if(f.variants.length){
    wrap.classList.remove("hidden");sel.disabled=false;setOptions(sel,f.variants.map(v=>({label:v,value:v})),"Seleccionar color / variante...",selected.variant);
  }else{
    wrap.classList.add("hidden");sel.disabled=true;sel.replaceChildren(new Option("Sin variante","",true,true));selected.variant="";
  }
}
function renderThickness(){
  const f=family(), wrap=$("thicknessWrap"), sel=$("thicknessSelect");
  if(!f){wrap.classList.add("hidden");sel.disabled=true;setOptions(sel,[],"Seleccionar grosor...");return;}
  if(f.variants.length && !selected.variant){
    wrap.classList.remove("hidden");sel.disabled=true;setOptions(sel,[],"Seleccioná un color / variante primero...");
    return;
  }
  let ts=Array.isArray(f.thicknesses)?[...f.thicknesses]:[];
  if(!ts.length){
    const list=records.filter(r=>r.materialId===f.id&&(r.variant||"")===selected.variant).map(r=>Number(r.thickness));
    ts=[...new Set(list)].sort((a,b)=>a-b);
  }
  wrap.classList.remove("hidden");
  if(ts.length){
    setOptions(sel,ts.map(t=>({label:`${t} mm`,value:String(t)})),"Seleccionar grosor...",selected.thickness);
    sel.disabled=false;
  }else{
    setOptions(sel,[],"Grosor pendiente de definir...");
    sel.disabled=true;
  }
}
function renderSelected(){
  const r=rec(), f=family(), variant=selected.variant?` · ${selected.variant}`:"";
  $("thicknessCard").classList.toggle("hidden",!selected.thickness);
  $("priceCard").classList.toggle("hidden",!selected.thickness);
  $("selectedThickness").textContent=selected.thickness?`${selected.thickness} mm`:"—";
  $("selectedPrice").textContent=selected.thickness?(r?`${money(r.price)}/m²`:"Precio pendiente"):"—";
  $("materialStatus").textContent=selected.thickness?`${f?.label||""}${variant} · ${selected.thickness} mm`:"Material no seleccionado";
  $("viewerMaterial").textContent=selected.thickness?`${f?.label||""}${variant} · ${selected.thickness} mm`:f?`${f.label}${variant}`:"Sin material";
}

function dims(){return {W:+$("width").value||670,H:+$("height").value||860,D:+$("depth").value||430,T:Number(selected.thickness)||18}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function normalize(model){
  const innerW=Math.max(model.W-2*model.T,0), maxDiv=Math.max(innerW-model.T,0);
  dividers=dividers.map(d=>({...d,position:clamp(+d.position||0,0,maxDiv)})).sort((a,b)=>a.position-b.position);
}
function sections(model){
  normalize(model); const innerW=Math.max(model.W-2*model.T,0), edges=[0,...dividers.map(d=>d.position),innerW];
  const out=[];
  for(let i=0;i<edges.length-1;i++){
    const left=i===0?0:edges[i]+model.T, right=i===edges.length-2?innerW:edges[i+1];
    out.push({index:i,left,right,width:Math.max(0,right-left)});
  }
  return out;
}
function getParts(){
  const m=dims(), ss=sections(m), p=[];
  p.push({name:"Lateral izquierdo",w:m.T,h:m.H,d:m.D,x:-m.W/2+m.T/2,y:0,z:0,type:"outer"});
  p.push({name:"Lateral derecho",w:m.T,h:m.H,d:m.D,x:m.W/2-m.T/2,y:0,z:0,type:"outer"});
  p.push({name:"Tapa",w:Math.max(m.W-2*m.T,0),h:m.T,d:m.D,x:0,y:m.H/2-m.T/2,z:0,type:"horizontal"});
  p.push({name:"Base",w:Math.max(m.W-2*m.T,0),h:m.T,d:m.D,x:0,y:-m.H/2+m.T/2,z:0,type:"horizontal"});
  dividers.forEach((d,i)=>{
    const x=-m.W/2+m.T+d.position+m.T/2;
    p.push({name:`División vertical ${i+1}`,w:m.T,h:Math.max(m.H-2*m.T,0),d:m.D,x,y:0,z:0,type:"divider"});
  });
  shelves.forEach((s,i)=>{
    const sec=ss[clamp(Math.round(+s.section||0),0,ss.length-1)];
    const h=clamp(+s.height||0,0,Math.max(m.H-2*m.T,0)-m.T);
    const y=-m.H/2+m.T+h+m.T/2;
    p.push({name:`Estante ${i+1}`,w:sec.width,h:m.T,d:m.D,x:-m.W/2+m.T+sec.left+sec.width/2,y,z:0,type:"shelf",section:sec.index});
  });
  return {model:m,sections:ss,parts:p};
}
function roundingCost(raw){
  let s={minimumPieceCost:4000,roundingUnit:1000};
  try{s={...s,...JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}")};}catch{}
  const min=Math.max(+s.minimumPieceCost||0,0),unit=Math.max(+s.roundingUnit||1,1);
  return raw<=0?0:Math.ceil(Math.max(raw,min)/unit)*unit;
}
function updateAll(){
  refreshRecords();
  const data=getParts(), r=rec(), hasPrice=!!r;
  let area=0,cost=0;
  $("partsBody").innerHTML=data.parts.map(p=>{
    const a=p.w*p.d/1e6; area+=a; const line=hasPrice?roundingCost(a*r.price):null; if(line!=null)cost+=line;
    return `<tr><td>${p.name}</td><td>1</td><td>${p.w.toFixed(0)} × ${p.d.toFixed(0)} mm</td><td>${a.toFixed(3)} m²</td><td>${line==null?"—":money(line)}</td></tr>`;
  }).join("");
  const waste=+($("waste").value||0), areaWaste=area*(1+waste/100);
  $("areaM2").textContent=area?`${area.toFixed(3)} m²`:"—";
  $("areaWaste").textContent=area?`${areaWaste.toFixed(3)} m²`:"—";
  $("priceM2Label").textContent=hasPrice?`${money(r.price)} / m²`:"Precio pendiente";
  $("materialCost").textContent=hasPrice?money(cost):"—";
  $("totalCost").textContent=hasPrice?money(cost):"—";
  $("budgetNote").textContent=hasPrice?"El costo aplica mínimo por pieza y redondeo del proveedor.":"Podés configurar el mueble sin precio; para calcular costo cargá esta combinación en Base de materiales.";
  $("innerWidth").textContent=`${Math.max(data.model.W-2*data.model.T,0).toFixed(0)} mm`;
  $("innerHeight").textContent=`${Math.max(data.model.H-2*data.model.T,0).toFixed(0)} mm`;
  $("dividerCount").textContent=dividers.length;
  $("shelfCount").textContent=shelves.length;
  $("viewerDimensions").textContent=`${data.model.W} × ${data.model.H} × ${data.model.D} mm`;
  const st={minimumPieceCost:4000,roundingUnit:1000}; try{Object.assign(st,JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}"))}catch{}
  $("ruleMin").textContent=money(st.minimumPieceCost);$("ruleRound").textContent=money(st.roundingUnit);
  const warnings=data.sections.filter(s=>s.width<100).map(s=>`Módulo ${s.index+1} tiene ${s.width.toFixed(0)} mm libres.`); $("modelWarning").textContent=warnings.join(" "); $("modelWarning").classList.toggle("hidden",!warnings.length);
  render3D(data);
}
function renderComponents(){
  const m=dims(),ss=sections(m);
  $("dividersList").innerHTML=dividers.map((d,i)=>`
    <div class="component-row"><label>División ${i+1}<div class="input-with-unit"><input class="divPos" data-id="${d.id}" type="number" min="0" max="${Math.max(m.W-2*m.T-m.T,0)}" value="${Math.round(d.position)}"><span>mm</span></div></label>
    <button class="danger-btn remDiv" data-id="${d.id}" type="button">Eliminar</button></div>`).join("")||'<div class="empty-mini">No hay divisiones.</div>';
  $("shelvesList").innerHTML=shelves.map((s,i)=>`
    <div class="component-row shelf-row"><label>Estante ${i+1}<div class="input-with-unit"><input class="shelfH" data-id="${s.id}" type="number" min="0" value="${Math.round(s.height)}"><span>mm</span></div></label>
    <label>Módulo<select class="shelfS" data-id="${s.id}">${ss.map(sec=>`<option value="${sec.index}" ${sec.index===s.section?"selected":""}>${sec.index+1} · ${Math.round(sec.width)} mm libres</option>`).join("")}</select></label>
    <button class="danger-btn remShelf" data-id="${s.id}" type="button">Eliminar</button></div>`).join("")||'<div class="empty-mini">No hay estantes.</div>';
}
$("addDivider").addEventListener("click",()=>{const m=dims();dividers.push({id:uid(),position:Math.min(300,Math.max(m.W-3*m.T,0))});renderComponents();updateAll();});
$("addShelf").addEventListener("click",()=>{shelves.push({id:uid(),section:0,height:300});renderComponents();updateAll();});
$("dividersList").addEventListener("change",e=>{const el=e.target.closest(".divPos");if(!el)return;const d=dividers.find(x=>x.id===el.dataset.id);if(d)d.position=+el.value||0;renderComponents();updateAll();});
$("dividersList").addEventListener("click",e=>{const b=e.target.closest(".remDiv");if(!b)return;dividers=dividers.filter(x=>x.id!==b.dataset.id);shelves=shelves.map(s=>({...s,section:Math.min(s.section,dividers.length)}));renderComponents();updateAll();});
$("shelvesList").addEventListener("change",e=>{
  const h=e.target.closest(".shelfH"), s=e.target.closest(".shelfS");
  const item=(h||s)&&shelves.find(x=>x.id===(h||s).dataset.id); if(!item)return;
  if(h)item.height=+h.value||0; if(s)item.section=+s.value||0; renderComponents();updateAll();
});
$("shelvesList").addEventListener("click",e=>{const b=e.target.closest(".remShelf");if(!b)return;shelves=shelves.filter(x=>x.id!==b.dataset.id);renderComponents();updateAll();});
["width","height","depth","waste"].forEach(id=>$(id).addEventListener("input",()=>{renderComponents();updateAll();}));

// --- Pure canvas 3D ---
function project(v,scale,cx,cy){
  let x=v.x,y=v.y,z=v.z;
  const cyaw=Math.cos(view.yaw), syaw=Math.sin(view.yaw);
  let rx=x*cyaw-z*syaw, rz=x*syaw+z*cyaw;
  const cp=Math.cos(view.pitch), sp=Math.sin(view.pitch);
  const ry=y*cp-rz*sp, rz2=y*sp+rz*cp;
  return {x:cx+rx*scale+view.panX,y:cy-ry*scale+view.panY,depth:rz2};
}
function verts(p){
  const x=p.w/2,y=p.h/2,z=p.d/2;
  return [
    {x:p.x-x,y:p.y-y,z:p.z-z},{x:p.x+x,y:p.y-y,z:p.z-z},{x:p.x+x,y:p.y+y,z:p.z-z},{x:p.x-x,y:p.y+y,z:p.z-z},
    {x:p.x-x,y:p.y-y,z:p.z+z},{x:p.x+x,y:p.y-y,z:p.z+z},{x:p.x+x,y:p.y+y,z:p.z+z},{x:p.x-x,y:p.y+y,z:p.z+z}
  ];
}
const FACE_DEFS=[
  [0,1,2,3,"front"],[1,5,6,2,"right"],[4,0,3,7,"left"],
  [3,2,6,7,"top"],[0,4,5,1,"bottom"],[4,5,6,7,"back"]
];
function palette(){
  const f=family(),v=(rec()?.variant||selected.variant||"").toLowerCase();
  if(v.includes("negro"))return ["#303030","#242424","#505050","#151515"];
  if(v.includes("blanco"))return ["#e9e9e4","#c8c8c1","#f6f6f0","#777770"];
  if(v.includes("roble")||v.includes("cedro")||v.includes("paraíso")||v.includes("guatambú")||v.includes("cerejeira")||f?.id==="pino"||f?.id==="eucaliptu")return ["#bb8b60","#936541","#d3a87d","#65472f"];
  if(f?.id==="fenolico")return ["#725f50","#4e4036","#8d7764","#342b25"];
  return ["#b9b7af","#98958d","#d4d0c7","#57564f"];
}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):(ctx.rect(x,y,w,h));}
function draw3D(data){
  if(!canvas)return;
  const dpr=Math.min(window.devicePixelRatio||1,2),rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=rect.width,H=rect.height; ctx.clearRect(0,0,W,H);
  // ground shadow
  ctx.save();ctx.fillStyle="rgba(0,0,0,.08)";ctx.beginPath();ctx.ellipse(W/2+view.panX,H*.86+view.panY,Math.min(W*.26,270)*view.zoom,Math.min(H*.06,38)*view.zoom,0,0,Math.PI*2);ctx.fill();ctx.restore();

  const all=data.parts.flatMap(p=>verts(p));
  const raw=all.map(v=>project(v,1,0,0));
  const minX=Math.min(...raw.map(p=>p.x)),maxX=Math.max(...raw.map(p=>p.x),1);
  const minY=Math.min(...raw.map(p=>p.y)),maxY=Math.max(...raw.map(p=>p.y),1);
  const baseScale=Math.min(W*.62/Math.max(maxX-minX,1),H*.66/Math.max(maxY-minY,1));
  const scale=baseScale*view.zoom;
  const center0=raw.map(p=>({x:p.x*scale,y:p.y*scale}));
  const cx=W/2-(minX+maxX)/2*scale, cy=H/2-(minY+maxY)/2*scale;

  const [front,side,top,edge]=palette();
  const faces=[];
  for(const part of data.parts){
    const vv=verts(part);
    for(const fd of FACE_DEFS){
      const q=fd[0]===undefined?[]:fd.slice(0,4).map(i=>project(vv[i],scale,cx,cy));
      const depth=q.reduce((a,b)=>a+b.depth,0)/q.length;
      faces.push({q,depth,kind:fd[4],part});
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  const fills={front,back:side,right:side,left:side,top,bottom:side};
  for(const face of faces){
    ctx.beginPath();face.q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=fills[face.kind];ctx.fill();ctx.strokeStyle=edge;ctx.lineWidth=1;ctx.stroke();
  }
  // subtle piece labels for dividers/shelves
  ctx.font="600 10px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";ctx.fillStyle="rgba(0,0,0,.42)";
  for(const p of data.parts.filter(x=>x.type==="divider"||x.type==="shelf")){
    const pv=project({x:p.x,y:p.y+p.h/2,z:p.d/2},scale,cx,cy);
    // only very subtle, never obstructing
    if(pv.x>0 && pv.x<W && pv.y>0 && pv.y<H){ /* intentionally no visible label */ }
  }
}
function render3D(data){draw3D(data);}

canvas=$("viewerCanvas");ctx=canvas.getContext("2d");
function resetView(){view={yaw:-0.72,pitch:0.42,zoom:1,panX:0,panY:0};updateAll();}
$("resetView").addEventListener("click",resetView);

canvas.addEventListener("pointerdown",e=>{
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  canvas.setPointerCapture?.(e.pointerId);
  if(activePointers.size===1){
    drag=true;dragMode=e.shiftKey?"pan":"rotate";last={x:e.clientX,y:e.clientY};canvas.classList.add("dragging");
  }else if(activePointers.size===2){
    const pts=[...activePointers.values()],dx=pts[0].x-pts[1].x,dy=pts[0].y-pts[1].y;pinchDistance=Math.hypot(dx,dy);
  }
});
canvas.addEventListener("pointermove",e=>{
  if(!activePointers.has(e.pointerId))return;activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(activePointers.size===2){
    const pts=[...activePointers.values()],dx=pts[0].x-pts[1].x,dy=pts[0].y-pts[1].y,d=Math.hypot(dx,dy);
    if(pinchDistance){view.zoom=clamp(view.zoom*(d/pinchDistance),.45,3.4);updateAll();}
    pinchDistance=d;return;
  }
  if(!drag)return;
  const dx=e.clientX-last.x,dy=e.clientY-last.y;last={x:e.clientX,y:e.clientY};
  if(dragMode==="pan"){view.panX+=dx;view.panY+=dy;}
  else{view.yaw+=dx*.008;view.pitch=clamp(view.pitch+dy*.008,-1.35,1.35);}
  updateAll();
});
function endPointer(e){activePointers.delete(e.pointerId);if(activePointers.size<2)pinchDistance=0;if(activePointers.size===0){drag=false;canvas.classList.remove("dragging");}}
canvas.addEventListener("pointerup",endPointer);canvas.addEventListener("pointercancel",endPointer);
canvas.addEventListener("wheel",e=>{e.preventDefault();view.zoom=clamp(view.zoom*Math.exp(-e.deltaY*.001),.45,3.4);updateAll();},{passive:false});
window.addEventListener("resize",()=>updateAll());

function init(){
  // If the user already had records, preserve them. Otherwise MDF 15 is supplied by readMaterials().
  initMaterialSelectors();renderVariant();renderThickness();renderComponents();
  updateAll();
}
init();
})();
