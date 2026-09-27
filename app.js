
(() => {
"use strict";

const $ = id => document.getElementById(id);
const money = v => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(v)||0);

let records = window.readMaterials();
let selected = {family:"",variant:"",thickness:"",recordId:""};
let dividers = [{id:uid(),position:470}];
let shelves = [
  {id:uid(),section:0,height:350},
  {id:uid(),section:1,height:235},
  {id:uid(),section:1,height:470}
];

// Perspective orbit camera.
// yaw = horizontal orbit, pitch = vertical orbit, distance = camera distance via zoom.
// panX/panY are screen-space translations.
let view = {yaw:-0.72,pitch:0.34,zoom:1,panX:0,panY:0};

let canvas, ctx;
let activePointers = new Map();
let dragMode = null;
let lastPointer = {x:0,y:0};
let pinchDistance = 0;

function uid(){ return window.uid ? window.uid() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function family(){ return window.getCatalog(selected.family); }
function rec(){
  records = window.readMaterials();
  return records.find(r=>r.id===selected.recordId) || null;
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

function setOptions(select,items,placeholder,value=""){
  select.replaceChildren(new Option(placeholder,"",true,!value));
  items.forEach(x => select.add(new Option(x.label,x.value)));
  if(value !== "" && value != null) select.value = String(value);
}

function initMaterialSelectors(){
  setOptions($("materialSelect"),window.MATERIAL_CATALOG.map(m=>({label:m.label,value:m.id})),"Seleccionar material...");

  $("materialSelect").addEventListener("change",()=>{
    selected.family = $("materialSelect").value;
    selected.variant = "";
    selected.thickness = "";
    selected.recordId = "";
    renderVariant();
    renderThickness();
    renderSelected();
    renderComponents();
    updateAll();
  });

  $("variantSelect").addEventListener("change",()=>{
    selected.variant = $("variantSelect").value;
    selected.thickness = "";
    selected.recordId = "";
    renderThickness();
    renderSelected();
    updateAll();
  });

  $("thicknessSelect").addEventListener("change",()=>{
    selected.thickness = String($("thicknessSelect").value || "");
    const r = window.readMaterials().find(x =>
      x.materialId === selected.family &&
      (x.variant||"") === (selected.variant||"") &&
      Number(x.thickness) === Number(selected.thickness)
    );
    selected.recordId = r?.id || "";
    renderSelected();
    updateAll();
  });
}

function renderVariant(){
  const f = family(), wrap = $("variantWrap"), sel = $("variantSelect");
  if(!f){
    wrap.classList.add("hidden");
    sel.disabled = true;
    setOptions(sel,[],"Seleccionar color / variante...");
    return;
  }
  if(f.variants.length){
    wrap.classList.remove("hidden");
    sel.disabled = false;
    setOptions(sel,f.variants.map(v=>({label:v,value:v})),"Seleccionar color / variante...",selected.variant);
  }else{
    wrap.classList.add("hidden");
    sel.disabled = true;
    sel.replaceChildren(new Option("Sin variante","",true,true));
    selected.variant = "";
  }
}

function renderThickness(){
  const f = family(), wrap = $("thicknessWrap"), sel = $("thicknessSelect");
  if(!f){
    wrap.classList.add("hidden");
    sel.disabled = true;
    setOptions(sel,[],"Seleccionar grosor...");
    return;
  }

  if(f.variants.length && !selected.variant){
    wrap.classList.remove("hidden");
    sel.disabled = true;
    setOptions(sel,[],"Seleccioná un color / variante primero...");
    return;
  }

  // En materiales sin variante, los grosores quedan disponibles inmediatamente.
  let ts = Array.isArray(f.thicknesses) ? [...f.thicknesses] : [];
  if(!ts.length){
    const list = window.readMaterials()
      .filter(r=>r.materialId===f.id && (r.variant||"")===selected.variant)
      .map(r=>Number(r.thickness));
    ts = [...new Set(list)].sort((a,b)=>a-b);
  }

  wrap.classList.remove("hidden");
  if(ts.length){
    setOptions(sel,ts.map(t=>({label:`${t} mm`,value:String(t)})),"Seleccionar grosor...",selected.thickness);
    sel.disabled = false;
  }else{
    setOptions(sel,[],"Grosor pendiente de definir...");
    sel.disabled = true;
  }
}

function renderSelected(){
  const r = rec(), f = family(), variant = selected.variant ? ` · ${selected.variant}` : "";
  $("thicknessCard").classList.toggle("hidden",!selected.thickness);
  $("priceCard").classList.toggle("hidden",!selected.thickness);
  $("selectedThickness").textContent = selected.thickness ? `${selected.thickness} mm` : "—";
  $("selectedPrice").textContent = selected.thickness ? (r ? `${money(r.price)}/m²` : "Precio pendiente") : "—";
  $("materialStatus").textContent = selected.thickness ? `${f?.label||""}${variant} · ${selected.thickness} mm` : "Material no seleccionado";
  $("viewerMaterial").textContent = selected.thickness ? `${f?.label||""}${variant} · ${selected.thickness} mm` : (f ? `${f.label}${variant}` : "Sin material");
}

function dims(){
  return {
    W:+$("width").value || 670,
    H:+$("height").value || 860,
    D:+$("depth").value || 430,
    T:Number(selected.thickness) || 18
  };
}

function normalize(model){
  const innerW = Math.max(model.W-2*model.T,0);
  const maxDiv = Math.max(innerW-model.T,0);
  dividers = dividers
    .map(d=>({...d,position:clamp(+d.position||0,0,maxDiv)}))
    .sort((a,b)=>a.position-b.position);
}

function sections(model){
  normalize(model);
  const innerW = Math.max(model.W-2*model.T,0);
  const edges = [0,...dividers.map(d=>d.position),innerW];
  const out = [];
  for(let i=0;i<edges.length-1;i++){
    const left = i===0 ? 0 : edges[i]+model.T;
    const right = i===edges.length-2 ? innerW : edges[i+1];
    out.push({index:i,left,right,width:Math.max(0,right-left)});
  }
  return out;
}

function getParts(){
  const m = dims(), ss = sections(m), p = [];
  const innerW = Math.max(m.W-2*m.T,0), innerH = Math.max(m.H-2*m.T,0);

  p.push({name:"Lateral izquierdo",w:m.T,h:m.H,d:m.D,x:-m.W/2+m.T/2,y:0,z:0,type:"outer",grain:"vertical"});
  p.push({name:"Lateral derecho",w:m.T,h:m.H,d:m.D,x:m.W/2-m.T/2,y:0,z:0,type:"outer",grain:"vertical"});
  p.push({name:"Tapa",w:innerW,h:m.T,d:m.D,x:0,y:m.H/2-m.T/2,z:0,type:"horizontal",grain:"horizontal"});
  p.push({name:"Base",w:innerW,h:m.T,d:m.D,x:0,y:-m.H/2+m.T/2,z:0,type:"horizontal",grain:"horizontal"});

  dividers.forEach((d,i)=>{
    const x = -m.W/2 + m.T + d.position + m.T/2;
    p.push({name:`División vertical ${i+1}`,w:m.T,h:innerH,d:m.D,x,y:0,z:0,type:"divider",grain:"vertical"});
  });

  shelves.forEach((s,i)=>{
    const sec = ss[clamp(Math.round(+s.section||0),0,Math.max(ss.length-1,0))];
    const h = clamp(+s.height||0,0,Math.max(innerH-m.T,0));
    const y = -m.H/2 + m.T + h + m.T/2;
    p.push({name:`Estante ${i+1}`,w:sec.width,h:m.T,d:m.D,
      x:-m.W/2+m.T+sec.left+sec.width/2,y,z:0,type:"shelf",section:sec.index,grain:"horizontal"});
  });

  return {model:m,sections:ss,parts:p};
}

function roundingCost(raw){
  let s = {minimumPieceCost:4000,roundingUnit:1000};
  try{ s = {...s,...JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}")}; }catch{}
  const min = Math.max(+s.minimumPieceCost||0,0);
  const unit = Math.max(+s.roundingUnit||1,1);
  return raw<=0 ? 0 : Math.ceil(Math.max(raw,min)/unit)*unit;
}

function updateAll(){
  const data = getParts(), r = rec(), hasPrice = !!r;
  let area = 0, cost = 0;

  $("partsBody").innerHTML = data.parts.map(p=>{
    const a = p.w*p.d/1e6;
    area += a;
    const line = hasPrice ? roundingCost(a*r.price) : null;
    if(line != null) cost += line;
    return `<tr><td>${p.name}</td><td>1</td><td>${p.w.toFixed(0)} × ${p.d.toFixed(0)} mm</td><td>${a.toFixed(3)} m²</td><td>${line==null?"—":money(line)}</td></tr>`;
  }).join("");

  const waste = +($("waste").value||0), areaWaste = area*(1+waste/100);
  $("areaM2").textContent = area ? `${area.toFixed(3)} m²` : "—";
  $("areaWaste").textContent = area ? `${areaWaste.toFixed(3)} m²` : "—";
  $("priceM2Label").textContent = hasPrice ? `${money(r.price)} / m²` : "Precio pendiente";
  $("materialCost").textContent = hasPrice ? money(cost) : "—";
  $("totalCost").textContent = hasPrice ? money(cost) : "—";
  $("budgetNote").textContent = hasPrice
    ? "El costo aplica mínimo por pieza y redondeo del proveedor."
    : "Podés configurar el mueble sin precio; para calcular costo cargá esta combinación en Base de materiales.";

  $("innerWidth").textContent = `${Math.max(data.model.W-2*data.model.T,0).toFixed(0)} mm`;
  $("innerHeight").textContent = `${Math.max(data.model.H-2*data.model.T,0).toFixed(0)} mm`;
  $("dividerCount").textContent = dividers.length;
  $("shelfCount").textContent = shelves.length;
  $("viewerDimensions").textContent = `${data.model.W} × ${data.model.H} × ${data.model.D} mm`;

  const st = {minimumPieceCost:4000,roundingUnit:1000};
  try{ Object.assign(st,JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}")); }catch{}
  $("ruleMin").textContent = money(st.minimumPieceCost);
  $("ruleRound").textContent = money(st.roundingUnit);

  const warnings = data.sections.filter(s=>s.width<100).map(s=>`Módulo ${s.index+1} tiene ${s.width.toFixed(0)} mm libres.`);
  $("modelWarning").textContent = warnings.join(" ");
  $("modelWarning").classList.toggle("hidden",!warnings.length);

  render3D(data);
}

function renderComponents(){
  const m = dims(), ss = sections(m);

  $("dividersList").innerHTML = dividers.map((d,i)=>`
    <div class="component-row">
      <label>División ${i+1}<div class="input-with-unit">
        <input class="divPos" data-id="${d.id}" type="number" min="0" max="${Math.max(m.W-3*m.T,0)}" value="${Math.round(d.position)}">
        <span>mm</span>
      </div></label>
      <button class="danger-btn remDiv" data-id="${d.id}" type="button">Eliminar</button>
    </div>`).join("") || '<div class="empty-mini">No hay divisiones.</div>';

  $("shelvesList").innerHTML = shelves.map((s,i)=>`
    <div class="component-row shelf-row">
      <label>Estante ${i+1}<div class="input-with-unit">
        <input class="shelfH" data-id="${s.id}" type="number" min="0" value="${Math.round(s.height)}">
        <span>mm</span>
      </div></label>
      <label>Módulo<select class="shelfS" data-id="${s.id}">
        ${ss.map(sec=>`<option value="${sec.index}" ${sec.index===s.section?"selected":""}>${sec.index+1} · ${Math.round(sec.width)} mm libres</option>`).join("")}
      </select></label>
      <button class="danger-btn remShelf" data-id="${s.id}" type="button">Eliminar</button>
    </div>`).join("") || '<div class="empty-mini">No hay estantes.</div>';
}

$("addDivider").addEventListener("click",()=>{
  const m = dims();
  dividers.push({id:uid(),position:Math.min(300,Math.max(m.W-3*m.T,0))});
  renderComponents(); updateAll();
});

$("addShelf").addEventListener("click",()=>{
  shelves.push({id:uid(),section:0,height:300});
  renderComponents(); updateAll();
});

$("dividersList").addEventListener("change",e=>{
  const el = e.target.closest(".divPos");
  if(!el)return;
  const d = dividers.find(x=>x.id===el.dataset.id);
  if(d)d.position=+el.value||0;
  renderComponents();updateAll();
});

$("dividersList").addEventListener("click",e=>{
  const b=e.target.closest(".remDiv");if(!b)return;
  dividers=dividers.filter(x=>x.id!==b.dataset.id);
  shelves=shelves.map(s=>({...s,section:Math.min(s.section,dividers.length)}));
  renderComponents();updateAll();
});

$("shelvesList").addEventListener("change",e=>{
  const h=e.target.closest(".shelfH"), s=e.target.closest(".shelfS");
  const item=(h||s) && shelves.find(x=>x.id===(h||s).dataset.id);
  if(!item)return;
  if(h)item.height=+h.value||0;
  if(s)item.section=+s.value||0;
  renderComponents();updateAll();
});

$("shelvesList").addEventListener("click",e=>{
  const b=e.target.closest(".remShelf");if(!b)return;
  shelves=shelves.filter(x=>x.id!==b.dataset.id);
  renderComponents();updateAll();
});

["width","height","depth","waste"].forEach(id=>$(id).addEventListener("input",()=>{
  renderComponents();updateAll();
}));

// -------------------- PERSPECTIVE 3D --------------------

function vertices(part){
  const x=part.w/2,y=part.h/2,z=part.d/2;
  return [
    {x:part.x-x,y:part.y-y,z:part.z-z},
    {x:part.x+x,y:part.y-y,z:part.z-z},
    {x:part.x+x,y:part.y+y,z:part.z-z},
    {x:part.x-x,y:part.y+y,z:part.z-z},
    {x:part.x-x,y:part.y-y,z:part.z+z},
    {x:part.x+x,y:part.y-y,z:part.z+z},
    {x:part.x+x,y:part.y+y,z:part.z+z},
    {x:part.x-x,y:part.y+y,z:part.z+z}
  ];
}

const FACE_DEFS = [
  {idx:[0,1,2,3],axis:"front"},
  {idx:[1,5,6,2],axis:"right"},
  {idx:[4,0,3,7],axis:"left"},
  {idx:[3,2,6,7],axis:"top"},
  {idx:[0,4,5,1],axis:"bottom"},
  {idx:[4,5,6,7],axis:"back"}
];

function palette(){
  const f=family(), v=(rec()?.variant||selected.variant||"").toLowerCase();
  if(v.includes("negro")) return {base:"#272727",edge:"#111",wood:false,noise:.08};
  if(v.includes("blanco")) return {base:"#e7e6df",edge:"#72726d",wood:false,noise:.035};
  if(v.includes("roble")) return {base:"#b7895b",edge:"#62452e",wood:true,grain:"oak",noise:.06};
  if(v.includes("cedro")) return {base:"#b8784e",edge:"#5e3b27",wood:true,grain:"cedar",noise:.065};
  if(v.includes("paraíso")) return {base:"#c19a72",edge:"#76583f",wood:true,grain:"paraiso",noise:.05};
  if(v.includes("guatambú")) return {base:"#cfb187",edge:"#806c52",wood:true,grain:"guatambu",noise:.045};
  if(v.includes("cerejeira")) return {base:"#b36f55",edge:"#633f33",wood:true,grain:"cerejeira",noise:.055};
  if(f?.id==="pino") return {base:"#d2ae78",edge:"#77573b",wood:true,grain:"pine",noise:.065};
  if(f?.id==="eucaliptu") return {base:"#b69d7b",edge:"#6f5b46",wood:true,grain:"euca",noise:.06};
  if(f?.id==="fenolico") return {base:"#765f4f",edge:"#352b26",wood:true,grain:"phenolic",noise:.08};
  if(f?.id==="fibroplus") return {base:"#c4c1b7",edge:"#67665e",wood:false,noise:.04};
  return {base:"#bbb8af",edge:"#68665e",wood:false,noise:.04};
}

function shadeColor(hex,amount){
  const n=parseInt(hex.slice(1),16);
  const r=clamp(((n>>16)&255)+amount,0,255);
  const g=clamp(((n>>8)&255)+amount,0,255);
  const b=clamp((n&255)+amount,0,255);
  return `rgb(${r},${g},${b})`;
}
function hexToRgb(hex){
  const n=parseInt(hex.slice(1),16);
  return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}

function rotateWorld(v){
  // Orbit around the model center. Pitch is applied around camera-local X.
  const cy=Math.cos(view.yaw), sy=Math.sin(view.yaw);
  let x=v.x*cy-v.z*sy;
  let z=v.x*sy+v.z*cy;

  const cp=Math.cos(view.pitch), sp=Math.sin(view.pitch);
  let y=v.y*cp-z*sp;
  z=y*sp+z*cp;

  return {x,y,z};
}

function projectPerspective(v, scale, cx, cy, camDist){
  const r=rotateWorld(v);
  const near=Math.max(0.12,camDist*0.06);
  const depth=camDist-r.z;
  const p=camDist/depth;
  return {
    x:cx+r.x*scale*p,
    y:cy-r.y*scale*p,
    depth:r.z,
    p
  };
}

function computeCamera(data,W,H){
  // Fit to a bounding sphere so the object remains in frame at every orbit angle.
  const pts=data.parts.flatMap(vertices).map(rotateWorld);
  let maxR=1;
  for(const p of pts) maxR=Math.max(maxR,Math.hypot(p.x,p.y,p.z));

  // Moderate FOV: visibly conical, but not excessively distorted.
  const fov=38*Math.PI/180;
  const viewport=Math.min(W,H);
  const baseDistance=(maxR/Math.tan(fov/2))*1.75;
  const camDist=baseDistance/Math.max(view.zoom,.35);
  const scale=viewport/(2*Math.tan(fov/2));
  return {camDist,scale,maxR};
}

function beginPathPoly(ctx,pts){
  ctx.beginPath();
  pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();
}

function faceAxes(part,faceAxis){
  // Returns two 3D vectors spanning the face, normalized-ish.
  const hx=part.w/2, hy=part.h/2, hz=part.d/2;
  if(faceAxis==="front" || faceAxis==="back") return [
    {x:part.w,y:0,z:0},{x:0,y:part.h,z:0}
  ];
  if(faceAxis==="right" || faceAxis==="left") return [
    {x:0,y:0,z:part.d},{x:0,y:part.h,z:0}
  ];
  return [
    {x:part.w,y:0,z:0},{x:0,y:0,z:part.d}
  ];
}

function faceOrigin(part,faceAxis){
  const x=part.w/2,y=part.h/2,z=part.d/2;
  switch(faceAxis){
    case "front": return {x:part.x,y:part.y,z:part.z-z};
    case "back": return {x:part.x,y:part.y,z:part.z+z};
    case "right": return {x:part.x+x,y:part.y,z:part.z};
    case "left": return {x:part.x-x,y:part.y,z:part.z};
    case "top": return {x:part.x,y:part.y+y,z:part.z};
    case "bottom": return {x:part.x,y:part.y-y,z:part.z};
  }
  return {x:part.x,y:part.y,z:part.z};
}

function textureParams(pal,part){
  // Grain frequency based on physical dimensions; deterministic from piece size/name.
  const maxDim=Math.max(part.w,part.h,part.d);
  const count=clamp(Math.round(maxDim/34),8,38);
  return {count,amp:Math.max(0.7,Math.min(3.2,maxDim/320)),grain:pal.grain||"generic"};
}

function drawWoodGrain(ctx, face, part, projected, pal, scale, cx, cy, camDist){
  const [a,b]=faceAxes(part,face.axis);
  const origin=faceOrigin(part,face.axis);
  const tp=textureParams(pal,part);

  // Determine grain direction along the longer board axis.
  const lenA=Math.hypot(a.x,a.y,a.z), lenB=Math.hypot(b.x,b.y,b.z);
  const grainAxis=lenA>=lenB ? a : b;
  const crossAxis=lenA>=lenB ? b : a;

  ctx.save();
  beginPathPoly(ctx,projected);
  ctx.clip();

  // Subtle wood tonal wash.
  const rgb=hexToRgb(pal.base);
  const grad=ctx.createLinearGradient(0,0,0,ctx.canvas.height);
  grad.addColorStop(0,`rgba(${rgb.r+Math.min(20,255-rgb.r)},${rgb.g+Math.min(16,255-rgb.g)},${rgb.b+10},.10)`);
  grad.addColorStop(.52,`rgba(80,45,25,.025)`);
  grad.addColorStop(1,`rgba(0,0,0,.07)`);
  ctx.fillStyle=grad; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

  // Grain streaks running along the board's longest dimension.
  const span=Math.max(lenA,lenB);
  const step=span/(tp.count+1);
  for(let i=1;i<=tp.count;i++){
    const offset=(i*step-span/2);
    const phase=(i*37 % 97)/97;
    const wiggle=tp.amp*(0.4+phase);

    const p1={x:origin.x+crossAxis.x*(offset/Math.max(Math.hypot(crossAxis.x,crossAxis.y,crossAxis.z),1))*0.92,
              y:origin.y+crossAxis.y*(offset/Math.max(Math.hypot(crossAxis.x,crossAxis.y,crossAxis.z),1))*0.92,
              z:origin.z+crossAxis.z*(offset/Math.max(Math.hypot(crossAxis.x,crossAxis.y,crossAxis.z),1))*0.92};
    const p2={x:p1.x+grainAxis.x,y:p1.y+grainAxis.y,z:p1.z+grainAxis.z};

    const q1=projectPerspective(p1,scale,cx,cy,camDist);
    const q2=projectPerspective(p2,scale,cx,cy,camDist);
    ctx.beginPath();
    ctx.moveTo(q1.x,q1.y);
    const mx=(q1.x+q2.x)/2 + Math.sin(i*1.7)*wiggle;
    const my=(q1.y+q2.y)/2 + Math.cos(i*1.3)*wiggle;
    ctx.quadraticCurveTo(mx,my,q2.x,q2.y);
    ctx.strokeStyle = i%5===0 ? "rgba(72,39,22,.24)" : "rgba(70,42,25,.12)";
    ctx.lineWidth = i%7===0 ? 1.35 : .75;
    ctx.stroke();
  }

  // Fine pores/noise, deterministic enough and cheap.
  const dots=Math.round(tp.count*3.2);
  ctx.fillStyle="rgba(45,30,20,.11)";
  for(let i=0;i<dots;i++){
    const t=(i*0.61803398875)%1;
    const s=(i*0.38196601125)%1;
    const p={x:origin.x+grainAxis.x*t+crossAxis.x*(s-.5),
             y:origin.y+grainAxis.y*t+crossAxis.y*(s-.5),
             z:origin.z+grainAxis.z*t+crossAxis.z*(s-.5)};
    const q=projectPerspective(p,scale,cx,cy,camDist);
    ctx.beginPath();ctx.arc(q.x,q.y,.65,0,Math.PI*2);ctx.fill();
  }

  ctx.restore();
}

function draw3D(data){
  if(!canvas)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const rect=canvas.getBoundingClientRect();
  const W=Math.max(280,rect.width), H=Math.max(320,rect.height);
  canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.clearRect(0,0,W,H);

  // Ground shadow.
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.10)";
  ctx.filter="blur(7px)";
  ctx.beginPath();
  ctx.ellipse(W/2+view.panX,H*.87+view.panY,Math.min(W*.28,290)*view.zoom,Math.min(H*.06,40)*view.zoom,0,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  const camera=computeCamera(data,W,H);
  const cx=W/2+view.panX, cy=H/2+view.panY+20;

  const pal=palette();
  const faces=[];

  for(const part of data.parts){
    const vv=vertices(part);
    for(const fd of FACE_DEFS){
      const projected=fd.idx.map(i=>projectPerspective(vv[i],camera.scale,cx,cy,camera.camDist));
      const depth=projected.reduce((a,p)=>a+p.depth,0)/projected.length;
      faces.push({projected,depth,axis:fd.axis,part});
    }
  }

  // Back-to-front painter's algorithm in perspective space.
  faces.sort((a,b)=>a.depth-b.depth);

  for(const face of faces){
    beginPathPoly(ctx,face.projected);

    const light={
      front:-2,right:-9,left:-4,top:16,bottom:-14,back:-6
    }[face.axis]||0;

    ctx.fillStyle = shadeColor(pal.base,light);
    ctx.fill();

    // Realistic wood grain or matte microtexture.
    if(pal.wood){
      drawWoodGrain(ctx,face.axis?face:face,face.part,face.projected,pal,camera.scale,cx,cy,camera.camDist);
    }else{
      // Fine surface variation for MDF/melamine/fibroplus.
      ctx.save();
      beginPathPoly(ctx,face.projected);
      ctx.clip();
      const rgb=hexToRgb(pal.base);
      const g=ctx.createLinearGradient(0,0,face.projected[0].x,face.projected[2].y);
      g.addColorStop(0,`rgba(${rgb.r},${rgb.g},${rgb.b},.03)`);
      g.addColorStop(1,`rgba(0,0,0,${pal.noise||.03})`);
      ctx.fillStyle=g;ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle=pal.edge;
    ctx.lineWidth=1;
    beginPathPoly(ctx,face.projected);
    ctx.stroke();
  }

  // Crisp construction edges on the front-most pieces.
  ctx.save();
  ctx.strokeStyle="rgba(35,32,28,.28)";
  ctx.lineWidth=.75;
  for(const p of data.parts.filter(x=>x.type==="divider"||x.type==="shelf")){
    const vv=vertices(p), q=[vv[0],vv[1],vv[2],vv[3]].map(v=>projectPerspective(v,camera.scale,cx,cy,camera.camDist));
    beginPathPoly(ctx,q);ctx.stroke();
  }
  ctx.restore();
}

function render3D(data){ draw3D(data); }

function resetView(){
  view={yaw:-0.72,pitch:0.34,zoom:1,panX:0,panY:0};
  updateAll();
}

canvas=$("viewerCanvas");
ctx=canvas.getContext("2d");

$("resetView").addEventListener("click",resetView);

// Mouse/touch orbit controls.
// Drag = orbit. Shift+drag = pan. Wheel/pinch = zoom.
canvas.addEventListener("pointerdown",e=>{
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  canvas.setPointerCapture?.(e.pointerId);

  if(activePointers.size===1){
    dragMode=e.shiftKey?"pan":"orbit";
    lastPointer={x:e.clientX,y:e.clientY};
    canvas.classList.add("dragging");
  }else if(activePointers.size===2){
    const pts=[...activePointers.values()];
    pinchDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
  }
});

canvas.addEventListener("pointermove",e=>{
  if(!activePointers.has(e.pointerId))return;
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(activePointers.size===2){
    const pts=[...activePointers.values()];
    const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    if(pinchDistance) view.zoom=clamp(view.zoom*(d/pinchDistance),.45,3.1);
    pinchDistance=d;
    updateAll();
    return;
  }

  if(!dragMode)return;

  const dx=e.clientX-lastPointer.x, dy=e.clientY-lastPointer.y;
  lastPointer={x:e.clientX,y:e.clientY};

  if(dragMode==="pan"){
    view.panX+=dx;view.panY+=dy;
  }else{
    view.yaw+=dx*.009;
    view.pitch=clamp(view.pitch+dy*.009,-1.42,1.42);
  }
  updateAll();
});

function endPointer(e){
  activePointers.delete(e.pointerId);
  if(activePointers.size<2)pinchDistance=0;
  if(activePointers.size===0){
    dragMode=null;
    canvas.classList.remove("dragging");
  }
}
canvas.addEventListener("pointerup",endPointer);
canvas.addEventListener("pointercancel",endPointer);

canvas.addEventListener("wheel",e=>{
  e.preventDefault();
  view.zoom=clamp(view.zoom*Math.exp(-e.deltaY*.001),.45,3.1);
  updateAll();
},{passive:false});

window.addEventListener("resize",()=>updateAll());

function init(){
  initMaterialSelectors();
  renderVariant();
  renderThickness();
  renderComponents();
  updateAll();
}
init();
})();
