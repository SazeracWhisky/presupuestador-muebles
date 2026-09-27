
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
let basePlacement = "inside";
let roofPlacement = "inside";

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
  const innerW = Math.max(m.W - 2*m.T, 0);
  const innerH = Math.max(m.H - 2*m.T, 0);

  // Horizontal pieces:
  // "inside" = between side panels, so width is W - 2T.
  // "outside" = covers the sides, so width is the full W.
  const baseWidth = basePlacement === "inside" ? Math.max(m.W - 2*m.T, 0) : m.W;
  const roofWidth = roofPlacement === "inside" ? Math.max(m.W - 2*m.T, 0) : m.W;

  // If a horizontal panel sits ON the laterals, the overall height includes
  // that panel's thickness outside the verticals. The verticals must therefore
  // be shortened on that side. If the horizontal is BETWEEN the laterals, the
  // laterals remain full-height and the horizontal width is W - 2T.
  const bottomInset = basePlacement === "outside" ? m.T : 0;
  const topInset = roofPlacement === "outside" ? m.T : 0;
  const verticalHeight = Math.max(m.H - bottomInset - topInset, 0);
  const verticalCenterY = (bottomInset - topInset) / 2;

  // Side panels.
  p.push({
    name:"Lateral izquierdo", w:m.T, h:verticalHeight, d:m.D,
    x:-m.W/2+m.T/2, y:verticalCenterY, z:0, type:"outer", grain:"vertical"
  });
  p.push({
    name:"Lateral derecho", w:m.T, h:verticalHeight, d:m.D,
    x:m.W/2-m.T/2, y:verticalCenterY, z:0, type:"outer", grain:"vertical"
  });

  // Base and roof keep their outer faces flush with the overall dimensions.
  const baseY = basePlacement === "inside"
    ? -m.H/2 + bottomInset + m.T/2
    : -m.H/2 + m.T/2;
  const roofY = roofPlacement === "inside"
    ?  m.H/2 - topInset - m.T/2
    :  m.H/2 - m.T/2;

  p.push({
    name:`Base · ${basePlacement === "inside" ? "entre laterales" : "sobre laterales"}`,
    w:baseWidth, h:m.T, d:m.D, x:0, y:baseY, z:0,
    type:"horizontal", grain:"horizontal"
  });
  p.push({
    name:`Tapa · ${roofPlacement === "inside" ? "entre laterales" : "sobre laterales"}`,
    w:roofWidth, h:m.T, d:m.D, x:0, y:roofY, z:0,
    type:"horizontal", grain:"horizontal"
  });

  // Vertical dividers always live in the clear opening between base and roof.
  dividers.forEach((d,i)=>{
    const x = -m.W/2 + m.T + d.position + m.T/2;
    p.push({
      name:`División vertical ${i+1}`,
      w:m.T, h:innerH, d:m.D, x, y:verticalCenterY, z:0,
      type:"divider", grain:"vertical"
    });
  });

  // Shelves: clear width of each module is already computed from the faces of
  // the surrounding verticals. Their width therefore changes automatically
  // when the user moves or adds a divider.
  shelves.forEach((s,i)=>{
    const sec = ss[clamp(Math.round(+s.section||0),0,Math.max(ss.length-1,0))];
    const h = clamp(+s.height||0,0,Math.max(innerH-m.T,0));
    const y = -m.H/2 + m.T + h + m.T/2;
    p.push({
      name:`Estante ${i+1}`,
      w:sec.width, h:m.T, d:m.D,
      x:-m.W/2+m.T+sec.left+sec.width/2, y, z:0,
      type:"shelf", section:sec.index, grain:"horizontal"
    });
  });

  return {
    model:m,
    sections:ss,
    parts:p,
    construction:{
      baseWidth, roofWidth, verticalHeight, innerW, innerH,
      basePlacement, roofPlacement, clearHeight:innerH
    }
  };
}

function roundingCost(raw){
  let s = {minimumPieceCost:4000,roundingUnit:1000};
  try{ s = {...s,...JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}")}; }catch{}
  const min = Math.max(+s.minimumPieceCost||0,0);
  const unit = Math.max(+s.roundingUnit||1,1);
  return raw<=0 ? 0 : Math.ceil(Math.max(raw,min)/unit)*unit;
}

function formatPieceDims(p){
  // Show cut dimensions as length × depth × thickness for horizontal pieces,
  // and height × depth × thickness for vertical pieces.
  if(p.type==="outer" || p.type==="divider"){
    return `${p.h.toFixed(0)} × ${p.d.toFixed(0)} × ${p.w.toFixed(0)} mm`;
  }
  return `${p.w.toFixed(0)} × ${p.d.toFixed(0)} × ${p.h.toFixed(0)} mm`;
}

function updateAll(){
  const data=getParts(), r=rec(), hasPrice=!!r;
  let area=0,cost=0;

  $("partsBody").innerHTML=data.parts.map(p=>{
    const a=p.w*p.d/1e6;
    area+=a;
    const line=hasPrice?roundingCost(a*r.price):null;
    if(line!=null)cost+=line;
    return `<tr><td>${p.name}</td><td>1</td><td>${formatPieceDims(p)}</td><td>${a.toFixed(3)} m²</td><td>${line==null?"—":money(line)}</td></tr>`;
  }).join("");

  const waste=+($("waste").value||0), areaWaste=area*(1+waste/100);
  $("areaM2").textContent=area?`${area.toFixed(3)} m²`:"—";
  $("areaWaste").textContent=area?`${areaWaste.toFixed(3)} m²`:"—";
  $("priceM2Label").textContent=hasPrice?`${money(r.price)} / m²`:"Precio pendiente";
  $("materialCost").textContent=hasPrice?money(cost):"—";
  $("totalCost").textContent=hasPrice?money(cost):"—";
  $("budgetNote").textContent=hasPrice
    ?"El costo aplica mínimo por pieza y redondeo del proveedor."
    :"Podés configurar el mueble sin precio; para calcular costo cargá esta combinación en Base de materiales.";

  $("innerWidth").textContent=`${data.construction.innerW.toFixed(0)} mm`;
  $("innerHeight").textContent=`${data.construction.innerH.toFixed(0)} mm`;
  $("dividerCount").textContent=dividers.length;
  $("shelfCount").textContent=shelves.length;
  $("viewerDimensions").textContent=`${data.model.W} × ${data.model.H} × ${data.model.D} mm`;

  const st={minimumPieceCost:4000,roundingUnit:1000};
  try{Object.assign(st,JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}"))}catch{}
  $("ruleMin").textContent=money(st.minimumPieceCost);
  $("ruleRound").textContent=money(st.roundingUnit);

  const warnings=[];
  data.sections.forEach((sec)=>{ if(sec.width<100)warnings.push(`Módulo ${sec.index+1} tiene ${sec.width.toFixed(0)} mm libres.`); });
  shelves.forEach((sh,i)=>{
    if(Number(sh.height)<0 || Number(sh.height)>data.construction.innerH-data.model.T)
      warnings.push(`El estante ${i+1} está fuera de la altura interior útil.`);
    const sec=data.sections[clamp(Math.round(+sh.section||0),0,Math.max(data.sections.length-1,0))];
    if(sec && sec.width<=data.model.T)warnings.push(`El estante ${i+1} no tiene un ancho útil suficiente en su módulo.`);
  });
  $("modelWarning").textContent=warnings.join(" ");
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

  const baseLabel = basePlacement === "inside" ? "Entre laterales" : "Sobre laterales";
  const roofLabel = roofPlacement === "inside" ? "Entre laterales" : "Sobre laterales";
  const baseCut = basePlacement==="inside" ? Math.max(m.W-2*m.T,0) : m.W;
  const roofCut = roofPlacement==="inside" ? Math.max(m.W-2*m.T,0) : m.W;
  const sideCut = Math.max(0,m.H-(basePlacement==="outside"?m.T:0)-(roofPlacement==="outside"?m.T:0));
  $("constructionSummary").innerHTML = `
    <div class="summary-line"><b>Base:</b> ${baseLabel} · ancho de corte <b>${baseCut.toFixed(0)} mm</b></div>
    <div class="summary-line"><b>Tapa:</b> ${roofLabel} · ancho de corte <b>${roofCut.toFixed(0)} mm</b></div>
    <div class="summary-line"><b>Laterales:</b> altura de corte <b>${sideCut.toFixed(0)} mm</b></div>
    <div class="summary-line"><b>Divisiones / estantes:</b> ancho de estantes calculado automáticamente según el espacio libre entre verticales · espesor <b>${m.T} mm</b></div>`;
}

$("basePlacement").addEventListener("change",e=>{
  basePlacement=e.target.value==="outside"?"outside":"inside";
  renderComponents();updateAll();
});
$("roofPlacement").addEventListener("change",e=>{
  roofPlacement=e.target.value==="outside"?"outside":"inside";
  renderComponents();updateAll();
});

$("addDivider").addEventListener("click",()=>{
  const m=dims();
  dividers.push({id:uid(),position:Math.min(300,Math.max(m.W-3*m.T,0))});
  renderComponents();updateAll();
});

$("addShelf").addEventListener("click",()=>{
  shelves.push({id:uid(),section:0,height:300});
  renderComponents();updateAll();
});

$("dividersList").addEventListener("change",e=>{
  const el=e.target.closest(".divPos");
  if(!el)return;
  const d=dividers.find(x=>x.id===el.dataset.id);
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
  if(v.includes("negro")) return {base:"#292929",edge:"#101010",wood:false,roughness:.32,grain:"none"};
  if(v.includes("blanco")) return {base:"#e7e6df",edge:"#6e6d68",wood:false,roughness:.22,grain:"none"};
  if(v.includes("roble")) return {base:"#b7895b",edge:"#60442e",wood:true,grain:"oak"};
  if(v.includes("cedro")) return {base:"#b87950",edge:"#603c29",wood:true,grain:"cedar"};
  if(v.includes("paraíso")) return {base:"#c29b71",edge:"#73573e",wood:true,grain:"paraiso"};
  if(v.includes("guatambú")) return {base:"#cfb48b",edge:"#77654d",wood:true,grain:"guatambu"};
  if(v.includes("cerejeira")) return {base:"#b77459",edge:"#624034",wood:true,grain:"cerejeira"};
  if(f?.id==="pino") return {base:"#d2ae78",edge:"#77563b",wood:true,grain:"pine"};
  if(f?.id==="eucaliptu") return {base:"#b89f7c",edge:"#6f5b46",wood:true,grain:"euca"};
  if(f?.id==="fenolico") return {base:"#765f4f",edge:"#352b25",wood:true,grain:"phenolic"};
  if(f?.id==="fibroplus") return {base:"#c5c2b7",edge:"#66645d",wood:false,roughness:.45,grain:"none"};
  return {base:"#b9b7ae",edge:"#595750",wood:false,roughness:.35,grain:"none"};
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

// Correct yaw + pitch rotation. Uses the original y/z values so the camera transform
// cannot compound its own result and explode the perspective.
function rotateWorld(v){
  const cy=Math.cos(view.yaw), sy=Math.sin(view.yaw);
  const x1=v.x*cy-v.z*sy;
  const z1=v.x*sy+v.z*cy;

  const cp=Math.cos(view.pitch), sp=Math.sin(view.pitch);
  const y0=v.y;
  const y1=y0*cp-z1*sp;
  const z2=y0*sp+z1*cp;

  return {x:x1,y:y1,z:z2};
}

// Perspective camera that is fitted numerically for the current orbit angle.
// This guarantees the complete model stays inside the viewport at every rotation.
function fitPerspective(rotated,W,H){
  const marginX=W*0.16, marginY=H*0.14;
  const maxX=W-marginX*2, maxY=H-marginY*2;
  const maxZ=Math.max(...rotated.map(p=>p.z));
  const minZ=Math.min(...rotated.map(p=>p.z));

  // Moderate field of view; zoom changes focal length, not model geometry.
  const baseFocal=Math.min(W,H)*1.05;
  const focal=baseFocal*view.zoom;

  function extents(cameraDistance){
    let minPX=Infinity,maxPX=-Infinity,minPY=Infinity,maxPY=-Infinity;
    for(const p of rotated){
      const denom=Math.max(cameraDistance-p.z, 1);
      const px=focal*p.x/denom;
      const py=focal*p.y/denom;
      minPX=Math.min(minPX,px); maxPX=Math.max(maxPX,px);
      minPY=Math.min(minPY,py); maxPY=Math.max(maxPY,py);
    }
    return {width:maxPX-minPX,height:maxPY-minPY,minPX,maxPX,minPY,maxPY};
  }

  // Start safely behind the whole object and binary-search the closest
  // camera that still fits. This avoids the runaway "wall" effect.
  let lo=Math.max(maxZ+100,1), hi=Math.max(maxZ-minZ,1000)*12;
  for(let i=0;i<42;i++){
    const mid=(lo+hi)/2;
    const e=extents(mid);
    if(e.width<=maxX && e.height<=maxY) hi=mid;
    else lo=mid;
  }
  const cameraDistance=hi*1.035;
  const e=extents(cameraDistance);
  return {cameraDistance,focal,e};
}

function projectPerspective(v,camera,cx,cy){
  const denom=Math.max(camera.cameraDistance-v.z,1);
  const q=camera.focal/denom;
  return {
    x:cx+v.x*q+view.panX,
    y:cy-v.y*q+view.panY,
    depth:v.z
  };
}

function beginPathPoly(ctx,pts){
  ctx.beginPath();
  pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();
}

function drawFaceTexture(ctx,facePoints,part,pal,kind){
  // Keep all texture strokes clipped to the actual face polygon.
  ctx.save();
  beginPathPoly(ctx,facePoints);
  ctx.clip();

  const xs=facePoints.map(p=>p.x), ys=facePoints.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const w=Math.max(1,maxX-minX), h=Math.max(1,maxY-minY);
  const rgb=hexToRgb(pal.base);

  const wash=ctx.createLinearGradient(minX,minY,maxX,maxY);
  wash.addColorStop(0,`rgba(255,255,255,.06)`);
  wash.addColorStop(.48,`rgba(120,70,40,.02)`);
  wash.addColorStop(1,`rgba(0,0,0,.06)`);
  ctx.fillStyle=wash;
  ctx.fillRect(minX-10,minY-10,w+20,h+20);

  if(pal.wood){
    // Direction follows the visible board's long dimension.
    const horizontal = w >= h;
    const count=clamp(Math.round((horizontal?w:h)/24),8,46);

    for(let i=0;i<count;i++){
      const t=(i+1)/(count+1);
      ctx.beginPath();

      if(horizontal){
        const y=minY+t*h;
        ctx.moveTo(minX-20,y);
        const amp=Math.max(0.6,Math.min(3.8,h*.012));
        const segments=9;
        for(let j=1;j<=segments;j++){
          const x=minX+(w+40)*(j/segments);
          const yy=y+Math.sin(j*.9+i*.63)*amp + Math.sin(j*2.1+i*.11)*amp*.35;
          ctx.lineTo(x,yy);
        }
      }else{
        const x=minX+t*w;
        ctx.moveTo(x,minY-20);
        const amp=Math.max(0.6,Math.min(3.8,w*.012));
        const segments=9;
        for(let j=1;j<=segments;j++){
          const y=minY+(h+40)*(j/segments);
          const xx=x+Math.sin(j*.9+i*.67)*amp + Math.sin(j*2.0+i*.17)*amp*.35;
          ctx.lineTo(xx,y);
        }
      }

      ctx.strokeStyle=i%6===0 ? "rgba(64,38,23,.24)" : "rgba(70,45,29,.105)";
      ctx.lineWidth=i%9===0 ? 1.25 : .7;
      ctx.stroke();
    }

    // Tiny pores and subtle knots, still clipped.
    ctx.fillStyle="rgba(58,38,25,.12)";
    const dots=Math.round(count*2.2);
    for(let i=0;i<dots;i++){
      const px=minX+(i*37.17%w), py=minY+(i*61.31%h);
      const rr=.5+(i%3)*.22;
      ctx.beginPath();ctx.ellipse(px,py,rr,rr*.6,0,0,Math.PI*2);ctx.fill();
    }

    // Very soft highlight at one edge to mimic a coated board.
    const gloss=ctx.createLinearGradient(minX,minY,maxX,maxY);
    gloss.addColorStop(0,"rgba(255,255,255,.06)");
    gloss.addColorStop(.5,"rgba(255,255,255,0)");
    gloss.addColorStop(1,"rgba(0,0,0,.05)");
    ctx.fillStyle=gloss;
    ctx.fillRect(minX-10,minY-10,w+20,h+20);
  }else{
    // Matte laminated/MDF surface: restrained microtone with no fake wood grain.
    ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},.025)`;
    ctx.fillRect(minX-10,minY-10,w+20,h+20);
  }
  ctx.restore();
}

function render3D(data){
  if(!canvas)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const rect=canvas.getBoundingClientRect();
  const W=Math.max(280,rect.width), H=Math.max(320,rect.height);
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  // Soft floor shadow independent of model projection.
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.09)";
  ctx.filter="blur(8px)";
  ctx.beginPath();
  ctx.ellipse(W/2+view.panX,H*.86+view.panY,Math.min(W*.28,300)*Math.min(view.zoom,1.6),Math.min(H*.055,36)*Math.min(view.zoom,1.6),0,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  const rawVerts=data.parts.flatMap(vertices);
  const rotated=rawVerts.map(rotateWorld);
  const camera=fitPerspective(rotated,W,H);

  const cx=W/2, cy=H/2+10;
  const pal=palette();
  const faces=[];

  // Transform every face with exactly the same fitted camera.
  for(const part of data.parts){
    const vv=vertices(part);
    for(const fd of FACE_DEFS){
      const worldFace=fd.idx.map(i=>rotateWorld(vv[i]));
      const projected=worldFace.map(v=>projectPerspective(v,camera,cx,cy));
      const depth=projected.reduce((a,p)=>a+p.depth,0)/projected.length;
      faces.push({projected,depth,axis:fd.axis,part});
    }
  }

  // Painter's algorithm.
  faces.sort((a,b)=>a.depth-b.depth);

  const light={front:0,right:-11,left:-5,top:17,bottom:-14,back:-8};

  for(const face of faces){
    beginPathPoly(ctx,face.projected);
    ctx.fillStyle=shadeColor(pal.base,light[face.axis]||0);
    ctx.fill();
    drawFaceTexture(ctx,face.projected,face.part,pal,face.axis);
    ctx.strokeStyle=pal.edge;
    ctx.lineWidth=1;
    beginPathPoly(ctx,face.projected);
    ctx.stroke();
  }

  // Construction lines remain crisp.
  ctx.save();
  ctx.strokeStyle="rgba(30,28,25,.27)";
  ctx.lineWidth=.75;
  for(const p of data.parts.filter(x=>x.type==="divider"||x.type==="shelf")){
    const q=vertices(p).slice(0,4).map(v=>projectPerspective(rotateWorld(v),camera,cx,cy));
    beginPathPoly(ctx,q);ctx.stroke();
  }
  ctx.restore();
}

// Interactive 3D controls.
canvas=$("viewerCanvas");
ctx=canvas.getContext("2d");

function resetView(){
  view={yaw:-0.72,pitch:0.34,zoom:1,panX:0,panY:0};
  updateAll();
}
$("resetView").addEventListener("click",resetView);

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
    if(pinchDistance) view.zoom=clamp(view.zoom*(d/pinchDistance),.55,2.4);
    pinchDistance=d;
    updateAll();
    return;
  }

  if(!dragMode)return;
  const dx=e.clientX-lastPointer.x, dy=e.clientY-lastPointer.y;
  lastPointer={x:e.clientX,y:e.clientY};

  if(dragMode==="pan"){
    view.panX=clamp(view.panX+dx,-WMax(canvas)*.8,WMax(canvas)*.8);
    view.panY=clamp(view.panY+dy,-HMax(canvas)*.8,HMax(canvas)*.8);
  }else{
    view.yaw+=dx*.0085;
    view.pitch=clamp(view.pitch+dy*.0085,-1.36,1.36);
  }
  updateAll();
});

function WMax(c){ return c.getBoundingClientRect().width || 1000; }
function HMax(c){ return c.getBoundingClientRect().height || 600; }

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
  view.zoom=clamp(view.zoom*Math.exp(-e.deltaY*.001),.55,2.4);
  updateAll();
},{passive:false});

window.addEventListener("resize",()=>updateAll());

function init(){
  initMaterialSelectors();
  $("basePlacement").value=basePlacement;
  $("roofPlacement").value=roofPlacement;
  renderVariant();
  renderThickness();
  renderComponents();
  updateAll();
}
init();
})();
