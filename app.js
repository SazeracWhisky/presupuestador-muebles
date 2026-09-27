'use strict';

/*
  Presupuestador de Muebles V1.4
  - Catálogo maestro: define materiales, variantes y grosores disponibles.
  - Precios: se guardan en localStorage y son editables.
  - Calculador: usa catálogo maestro aunque todavía no haya precios cargados.
  - Visor: proyección 3D axonométrica propia en Canvas, sin dependencias externas.
*/

const $ = (id) => document.getElementById(id);
const MATERIALS_KEY = 'presupuestador_materiales_v3';
const SETTINGS_KEY = 'presupuestador_settings_v1';

const CATALOG = [
  { id:'melamina_aglomerado', label:'Melamina Aglomerado', variants:['Blanco','Negro','Cedro'], thicknesses:[10,12,15,18] },
  { id:'melamina_mdf', label:'Melamina MDF', variants:['Blanco','Cedro','Roble Americano','Roble Dakar'], thicknesses:[12,15,18] },
  { id:'mdf', label:'MDF', variants:[], thicknesses:[3,5,9,12,15,18,25] },
  { id:'fibroplus', label:'Fibroplus', variants:['Blanco','Negro','Cedro'], thicknesses:[3,5] },
  { id:'pino', label:'Pino', variants:[], thicknesses:[18,22] },
  { id:'eucaliptu', label:'Eucaliptu', variants:[], thicknesses:[20,30] },
  { id:'fenolico', label:'Fenólico', variants:[], thicknesses:[6,8,10,12,15,18] },
  { id:'terciado_pino', label:'Terciado Pino', variants:[], thicknesses:[3] },
  { id:'enchapado_aglomerado', label:'Enchapado Aglomerado', variants:['Cedro','Cerejeira','Paraíso','Guatambú'], thicknesses:[] }
];

const state = {
  materials: [],
  selectedFamilyId: '',
  selectedVariant: '',
  selectedMaterialId: '',
  dividers: [{ id:uid(), position:470 }],
  shelves: [
    { id:uid(), section:0, height:350 },
    { id:uid(), section:1, height:235 },
    { id:uid(), section:1, height:470 }
  ],
  minimumPieceCost: 4000,
  roundingUnit: 1000,
  view: { yaw: -0.62, pitch: 0.48, zoom: 1 }
};

const inputIds = ['width','height','depth','waste'];
const els = Object.fromEntries(inputIds.map(id => [id, $(id)]));

function uid(){ return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function num(id){ return Number(els[id]?.value) || 0; }
function money(v){ return Number.isFinite(v) ? new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v) : '—'; }
function esc(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cat(id){ return CATALOG.find(m=>m.id===id) || null; }

function canonicalName(rec){
  const m=cat(rec?.materialId);
  if(!m) return rec?.name || '';
  return rec.variant ? `${m.label} · ${rec.variant}` : m.label;
}

function normalizeRecord(raw){
  if(!raw || typeof raw!=='object') return null;
  const materialId=String(raw.materialId||'');
  const material=cat(materialId);
  if(!material) return null;
  const variant=material.variants.includes(raw.variant) ? String(raw.variant) : '';
  const thickness=Number(raw.thickness);
  const price=Number(raw.price);
  if(!Number.isFinite(thickness) || thickness<=0 || !Number.isFinite(price) || price<0) return null;
  if(material.thicknesses.length && !material.thicknesses.includes(thickness)) return null;
  return {id:raw.id||uid(),materialId,variant,name:canonicalName({materialId,variant}),thickness,price};
}

function dedupe(records){
  const map=new Map();
  for(const raw of records){
    const r=normalizeRecord(raw); if(!r) continue;
    map.set(`${r.materialId}|${r.variant}|${r.thickness}`,r);
  }
  return [...map.values()];
}

function loadMaterials(){
  const keys=[MATERIALS_KEY,'presupuestador_materiales_v2','presupuestador_materiales_v1'];
  for(const key of keys){
    try{
      const raw=JSON.parse(localStorage.getItem(key)||'null');
      if(Array.isArray(raw)){
        const clean=dedupe(raw);
        if(clean.length) return clean;
      }
    }catch{}
  }
  // Primer registro de demostración basado en un precio que ya definimos.
  return [{id:uid(),materialId:'mdf',variant:'',name:'MDF',thickness:15,price:48000}];
}

function saveMaterials(){ localStorage.setItem(MATERIALS_KEY,JSON.stringify(state.materials)); }
function loadSettings(){ try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{};}catch{return{};} }
function saveSettings(){ localStorage.setItem(SETTINGS_KEY,JSON.stringify({minimumPieceCost:state.minimumPieceCost,roundingUnit:state.roundingUnit})); }

state.materials=loadMaterials();
const settings=loadSettings();
state.minimumPieceCost=Number.isFinite(Number(settings.minimumPieceCost))?Number(settings.minimumPieceCost):4000;
state.roundingUnit=Number.isFinite(Number(settings.roundingUnit))&&Number(settings.roundingUnit)>0?Number(settings.roundingUnit):1000;
saveMaterials();

function catalogHasRecords(id){ return state.materials.some(m=>m.materialId===id); }
function currentMaterial(){ return state.materials.find(m=>m.id===state.selectedMaterialId) || null; }
function rowsForFamily(){ return state.materials.filter(m=>m.materialId===state.selectedFamilyId && (!state.selectedVariant || m.variant===state.selectedVariant)); }
function priceRecord(){
  if(!state.selectedFamilyId) return null;
  const m=cat(state.selectedFamilyId); if(!m) return null;
  const variantRequired=m.variants.length>0;
  if(variantRequired && !state.selectedVariant) return null;
  if(!state.selectedMaterialId) return null;
  return currentMaterial();
}

function setOptions(select, items, placeholder, value=''){
  if(!select) return;
  select.replaceChildren(new Option(placeholder,'',true,!value));
  items.forEach(x=>select.add(new Option(x.label,x.value)));
  select.value=value;
}

function renderCalculatorMaterials(){
  const family=$('materialFamilySelect');
  if(!family) return;
  const previous=state.selectedFamilyId;
  setOptions(family,CATALOG.map(m=>({label:m.label,value:m.id})),'Seleccionar material...',previous);
  state.selectedFamilyId=CATALOG.some(m=>m.id===previous)?previous:'';
  family.value=state.selectedFamilyId;
  if(!state.selectedFamilyId){state.selectedVariant='';state.selectedMaterialId='';}
  renderCalcVariants();
}

function renderCalcVariants(){
  const family=cat(state.selectedFamilyId);
  const select=$('materialVariantSelect');
  const label=$('calcVariantLabel');
  if(!select) return;
  if(!family?.variants.length){
    select.replaceChildren(new Option('Sin variante','',true,true)); select.disabled=true; label?.classList.add('hidden'); state.selectedVariant='';
  }else{
    const keep=family.variants.includes(state.selectedVariant)?state.selectedVariant:'';
    setOptions(select,family.variants.map(v=>({label:v,value:v})),'Seleccionar color / variante...',keep);
    select.disabled=false; label?.classList.remove('hidden'); state.selectedVariant=keep;
  }
  renderCalcThicknesses();
}

function renderCalcThicknesses(){
  const family=cat(state.selectedFamilyId);
  const select=$('materialThicknessSelect');
  const label=$('calcThicknessLabel');
  if(!select) return;
  if(!family){
    setOptions(select,[],'Seleccioná un material primero...'); select.disabled=true; label?.classList.add('hidden'); state.selectedMaterialId=''; updateSelectedMaterialUI(); return;
  }
  if(family.variants.length && !state.selectedVariant){
    setOptions(select,[],'Seleccioná un color / variante primero...'); select.disabled=true; label?.classList.remove('hidden'); state.selectedMaterialId=''; updateSelectedMaterialUI(); return;
  }
  if(!family.thicknesses.length){
    setOptions(select,[],'Grosor pendiente de definir...'); select.disabled=true; label?.classList.remove('hidden'); state.selectedMaterialId=''; updateSelectedMaterialUI(); return;
  }
  const matches=rowsForFamily();
  const previous=state.selectedMaterialId;
  const options=family.thicknesses.map(mm=>{
    const rec=matches.find(r=>Number(r.thickness)===mm);
    return {label:`${mm} mm${rec?'':' · precio pendiente'}`,value:rec?.id||`missing:${mm}`};
  });
  setOptions(select,options,'Seleccionar grosor...',previous);
  select.disabled=false; label?.classList.remove('hidden');
  const found=matches.find(r=>r.id===previous);
  state.selectedMaterialId=found?.id||'';
  select.value=found?.id||'';
  updateSelectedMaterialUI();
}

function updateSelectedMaterialUI(){
  const rec=priceRecord();
  const thickCard=$('selectedThicknessCard'), priceCard=$('selectedPriceCard');
  thickCard?.classList.toggle('hidden',!rec);
  priceCard?.classList.toggle('hidden',!rec);
  $('selectedThickness').textContent=rec?`${rec.thickness} mm`:'—';
  $('selectedPrice').textContent=rec?`${money(rec.price)}/m²`:'—';
  const family=cat(state.selectedFamilyId);
  const chosenVariant=state.selectedVariant ? ` · ${state.selectedVariant}` : '';
  $('materialStatus').textContent=rec?`${family?.label||''}${chosenVariant} · ${rec.thickness} mm`:'Material no seleccionado';
  $('viewerMaterial').textContent=rec?`${family?.label||''}${chosenVariant} · ${rec.thickness} mm`:(family?`${family.label}${chosenVariant}`:'Sin material');
}

function dims(){
  const W=num('width'),H=num('height'),D=num('depth'),T=Number(currentMaterial()?.thickness)||18;
  return {W,H,D,T,innerW:Math.max(W-2*T,0),innerH:Math.max(H-2*T,0)};
}
function normalizeDividers(model){
  const max=Math.max(model.innerW-model.T,0);
  state.dividers=state.dividers.map(d=>({...d,position:Math.min(Math.max(Number(d.position)||0,0),max)})).sort((a,b)=>a.position-b.position);
}
function sections(model){
  normalizeDividers(model);
  const edges=[0,...state.dividers.map(d=>d.position),model.innerW];
  const out=[];
  for(let i=0;i<edges.length-1;i++){
    const left=i===0?0:edges[i]+model.T;
    const right=i===edges.length-2?model.innerW:edges[i+1];
    out.push({index:i,left,right,width:Math.max(right-left,0)});
  }
  return out;
}
function roundingCost(raw){
  const min=Math.max(Number(state.minimumPieceCost)||0,0), unit=Math.max(Number(state.roundingUnit)||1,1);
  if(raw<=0)return 0;
  return Math.ceil(Math.max(raw,min)/unit)*unit;
}

function getModel(){
  const model=dims(), secs=sections(model), parts=[];
  if(!model.W||!model.H||!model.D||!model.T)return {...model,sections:secs,parts};
  parts.push({name:'Lateral izquierdo',qty:1,w:model.T,h:model.H,d:model.D,x:-model.W/2+model.T/2,y:0,z:0,type:'panel'});
  parts.push({name:'Lateral derecho',qty:1,w:model.T,h:model.H,d:model.D,x:model.W/2-model.T/2,y:0,z:0,type:'panel'});
  parts.push({name:'Tapa',qty:1,w:model.innerW,h:model.T,d:model.D,x:0,y:model.H/2-model.T/2,z:0,type:'panel'});
  parts.push({name:'Base',qty:1,w:model.innerW,h:model.T,d:model.D,x:0,y:-model.H/2+model.T/2,z:0,type:'panel'});
  state.dividers.forEach((d,i)=>{
    const xLeft=-model.innerW/2+d.position;
    parts.push({name:`División vertical ${i+1}`,qty:1,w:model.T,h:model.innerH,d:model.D,x:xLeft+model.T/2,y:0,z:0,type:'divider'});
  });
  state.shelves.forEach((s,i)=>{
    const sec=secs[Math.min(Math.max(Math.round(Number(s.section)||0),0),Math.max(secs.length-1,0))];
    const height=Math.min(Math.max(Number(s.height)||0,0),Math.max(model.innerH-model.T,0));
    const y=-model.H/2+model.T+height+model.T/2;
    parts.push({name:`Estante ${i+1}`,qty:1,w:sec.width,h:model.T,d:model.D,x:-model.innerW/2+sec.left+sec.width/2,y,z:0,type:'shelf',section:sec.index});
  });
  return {...model,sections:secs,parts};
}

function renderComponents(){
  const model=dims(); normalizeDividers(model);
  const db=$('dividersList'), sb=$('shelvesList');
  if(db)db.innerHTML=state.dividers.length?state.dividers.map((d,i)=>`<div class="component-row"><label>División ${i+1}<div class="input-with-unit"><input class="divider-position" data-id="${esc(d.id)}" type="number" min="0" max="${Math.max(model.innerW-model.T,0)}" step="1" value="${Math.round(d.position)}"><span>mm</span></div></label><button type="button" class="danger-btn remove-divider" data-id="${esc(d.id)}">Eliminar</button></div>`).join(''):'<div class="empty-mini">No hay divisiones.</div>';
  const secs=sections(model);
  if(sb)sb.innerHTML=state.shelves.length?state.shelves.map((s,i)=>`<div class="component-row shelf-row"><label>Estante ${i+1}<div class="input-with-unit"><input class="shelf-height" data-id="${esc(s.id)}" type="number" min="0" max="${Math.max(model.innerH-model.T,0)}" step="1" value="${Math.round(s.height)}"><span>mm desde base</span></div></label><label>Módulo<select class="shelf-section" data-id="${esc(s.id)}">${secs.map(sec=>`<option value="${sec.index}" ${sec.index===s.section?'selected':''}>${sec.index+1} · ${Math.round(sec.width)} mm libres</option>`).join('')}</select></label><button type="button" class="danger-btn remove-shelf" data-id="${esc(s.id)}">Eliminar</button></div>`).join(''):'<div class="empty-mini">No hay estantes.</div>';
}

function updateBudget(){
  const model=getModel(), mat=currentMaterial();
  const body=$('partsBody'); let area=0,total=0;
  if(body){
    body.innerHTML=model.parts.map(p=>{
      const totalArea=(p.w*p.d*p.qty)/1e6; area+=totalArea;
      const raw=mat?totalArea*Number(mat.price):NaN; const line=mat?roundingCost(raw):NaN; if(Number.isFinite(line))total+=line;
      return `<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${p.w.toFixed(0)} × ${p.d.toFixed(0)} mm</td><td>${totalArea.toFixed(3)} m²</td><td>${Number.isFinite(line)?money(line):'—'}</td></tr>`;
    }).join('');
  }
  const wastePct=Math.max(0,num('waste')),areaWaste=area*(1+wastePct/100);
  $('areaM2').textContent=model.parts.length?`${area.toFixed(3)} m²`:'—';
  $('areaWaste').textContent=model.parts.length?`${areaWaste.toFixed(3)} m²`:'—';
  $('priceM2Label').textContent=mat?`${money(mat.price)} / m²`:'—';
  $('materialCost').textContent=mat?money(total):'—';
  $('totalCost').textContent=mat?money(total):'—';
  $('innerWidth').textContent=`${model.innerW.toFixed(0)} mm`;
  $('innerHeight').textContent=`${model.innerH.toFixed(0)} mm`;
  $('dividerCount').textContent=String(state.dividers.length);
  $('shelfCount').textContent=String(state.shelves.length);
  $('viewerDimensions').textContent=`${model.W.toFixed(0)} × ${model.H.toFixed(0)} × ${model.D.toFixed(0)} mm`;
  const warnings=[];
  model.sections.forEach(sec=>{if(sec.width<100)warnings.push(`Módulo ${sec.index+1} tiene solo ${sec.width.toFixed(0)} mm de ancho libre.`);});
  state.shelves.forEach((s,i)=>{if(Number(s.height)>model.innerH-model.T)warnings.push(`El estante ${i+1} está fuera del alto interior.`);});
  $('modelWarning').textContent=warnings.join(' ');
  $('modelWarning').classList.toggle('hidden',!warnings.length);
  $('budgetNote').textContent=mat?`Superficie neta de piezas: ${area.toFixed(3)} m². El costo se calcula por pieza con mínimo de ${money(state.minimumPieceCost)} y redondeo a ${money(state.roundingUnit)}.`:'Elegí una combinación de material, variante y grosor con precio cargado para activar el cálculo.';
  updateSelectedMaterialUI();
  render3D();
}

/* ---------- Visor 3D axonométrico propio en Canvas ---------- */
let canvas,ctx,dragging=false,lastPointer={x:0,y:0};
function colorForMaterial(){
  const m=currentMaterial();
  if(!m) return {base:'#d2cfc5',top:'#e4e1d7',side:'#bcb8ad',front:'#cbc7bc'};
  const v=(m.variant||'').toLowerCase();
  if(v.includes('negro')) return {base:'#2e2e2e',top:'#4b4b4b',side:'#242424',front:'#353535'};
  if(v.includes('blanco')) return {base:'#e8e8e5',top:'#f7f7f3',side:'#cfcfca',front:'#e1e1dc'};
  if(v.includes('roble')||v.includes('cedro')||v.includes('paraíso')||v.includes('guatambú')||v.includes('cerejeira')||m.materialId==='pino'||m.materialId==='eucaliptu') return {base:'#b9875b',top:'#d2a477',side:'#8f6846',front:'#aa7850'};
  if(m.materialId==='fenolico') return {base:'#6b5b4d',top:'#85705d',side:'#51453c',front:'#665446'};
  return {base:'#c8c5bb',top:'#dedbd1',side:'#aaa69c',front:'#bfbbb0'};
}
function rotatePoint(p){
  const cy=Math.cos(state.view.yaw),sy=Math.sin(state.view.yaw);
  let x=p.x*cy-p.z*sy, z=p.x*sy+p.z*cy;
  const cp=Math.cos(state.view.pitch),sp=Math.sin(state.view.pitch);
  const y=p.y*cp-z*sp; z=y*0+z*cp+p.y*sp; // overwritten below
  return {x, y:p.y*cp-(p.x*0+ (p.z*cy+p.x*sy))*sp, z:(p.z*cy+p.x*sy)*cp+p.y*sp};
}
function rot(p){
  const cy=Math.cos(state.view.yaw),sy=Math.sin(state.view.yaw);
  const x1=p.x*cy-p.z*sy;
  const z1=p.x*sy+p.z*cy;
  const cp=Math.cos(state.view.pitch),sp=Math.sin(state.view.pitch);
  return {x:x1,y:p.y*cp-z1*sp,z:p.y*sp+z1*cp};
}
function projectedBounds(parts,w,h){
  const pts=[];
  for(const p of parts){
    for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1])pts.push(rot({x:p.x+sx*p.w/2,y:p.y+sy*p.h/2,z:p.z+sz*p.d/2}));
  }
  if(!pts.length)return {minX:-1,maxX:1,minY:-1,maxY:1};
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
  const range=Math.max(maxX-minX,maxY-minY,1);
  const scale=Math.min(w,h)*0.72/range*state.view.zoom;
  return {minX,maxX,minY,maxY,scale,centerX:(minX+maxX)/2,centerY:(minY+maxY)/2};
}
function makeFaces(p){
  const x=p.w/2,y=p.h/2,z=p.d/2,c=[
    {p:[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z]],shade:'front'},
    {p:[[-x,-y,z],[-x,y,z],[x,y,z],[x,-y,z]],shade:'side'},
    {p:[[-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z]],shade:'top'},
    {p:[[-x,-y,-z],[-x,-y,z],[x,-y,z],[x,-y,-z]],shade:'bottom'},
    {p:[[-x,-y,-z],[-x,y,-z],[-x,y,z],[-x,-y,z]],shade:'side'},
    {p:[[x,-y,-z],[x,-y,z],[x,y,z],[x,y,-z]],shade:'front'}
  ];
  return c.map(f=>({poly:f.p.map(a=>rot({x:a[0]+p.x,y:a[1]+p.y,z:a[2]+p.z})),shade:f.shade}));
}
function render3D(){
  if(!canvas||!ctx)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2); const w=Math.max(20,Math.floor(rect.width*dpr)),h=Math.max(20,Math.floor(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.clearRect(0,0,w,h);
  const model=getModel(); if(!model.parts.length)return;
  const b=projectedBounds(model.parts,w,h), palette=colorForMaterial();
  const sx=w/2-b.centerX*b.scale, sy=h/2+b.centerY*b.scale;
  const project=q=>({x:sx+q.x*b.scale,y:sy-q.y*b.scale});
  ctx.save();
  // Ground shadow.
  ctx.fillStyle='rgba(0,0,0,.08)';
  ctx.beginPath();ctx.ellipse(w/2,h*0.84,Math.max(w*0.18,40)*state.view.zoom,Math.max(h*0.035,8)*state.view.zoom,0,0,Math.PI*2);ctx.fill();
  const faces=[];
  for(const part of model.parts){for(const face of makeFaces(part)){const avgZ=face.poly.reduce((a,q)=>a+q.z,0)/face.poly.length;faces.push({...face,avgZ});}}
  faces.sort((a,b)=>a.avgZ-b.avgZ);
  const fill={front:palette.front,side:palette.side,top:palette.top,bottom:palette.side};
  for(const face of faces){
    const pts=face.poly.map(project); ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y); ctx.closePath();
    ctx.fillStyle=fill[face.shade]||palette.base; ctx.fill(); ctx.strokeStyle='rgba(60,57,52,.48)';ctx.lineWidth=Math.max(0.8,dpr*0.8);ctx.stroke();
  }
  ctx.restore();
}
function init3D(){
  canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Visor 3D axonométrico');
  $('viewer')?.replaceChildren(canvas);
  const container=$('viewer');
  const resize=()=>render3D(); window.addEventListener('resize',resize); if('ResizeObserver' in globalThis)new ResizeObserver(resize).observe(container);
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return; const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y; lastPointer={x:e.clientX,y:e.clientY}; state.view.yaw+=dx*0.008; state.view.pitch=Math.max(-0.9,Math.min(1.2,state.view.pitch+dy*0.008)); render3D();});
  canvas.addEventListener('pointerup',e=>{dragging=false;canvas.releasePointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointercancel',()=>{dragging=false;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();state.view.zoom=Math.max(0.55,Math.min(2.4,state.view.zoom*Math.exp(-e.deltaY*0.001)));render3D();},{passive:false});
  render3D();
}
function resetView(){state.view={yaw:-0.62,pitch:0.48,zoom:1};render3D();}

function renderMaterialsPage(){
  const count=$('materialsCount'),body=$('materialsBody'),empty=$('emptyMaterials');
  if(count)count.textContent=`${state.materials.length} ${state.materials.length===1?'material':'materiales'}`;
  if(!body)return;
  body.innerHTML=state.materials.map(m=>`<tr><td><strong>${esc(cat(m.materialId)?.label||m.name)}</strong></td><td>${m.variant?esc(m.variant):'<span class="muted">—</span>'}</td><td>${m.thickness} mm</td><td><div class="input-with-unit"><input class="catalog-inline material-price" data-id="${esc(m.id)}" type="number" min="0" step="100" value="${Number(m.price)}" aria-label="Precio por m²"><span>ARS</span></div></td><td><button type="button" class="danger-btn delete-material" data-id="${esc(m.id)}">Eliminar</button></td></tr>`).join('');
  empty?.classList.toggle('hidden',state.materials.length>0);
}

function renderBaseMaterialForm(){
  const material=$('materialCategory'),variant=$('materialVariant'),thick=$('materialThickness'); if(!material||!variant||!thick)return;
  const selected=material.value; setOptions(material,CATALOG.map(m=>({label:m.label,value:m.id})),'Seleccionar material...',selected);
  const m=cat(material.value);
  if(!m){variant.replaceChildren(new Option('Sin variante',''));variant.disabled=true;variant.closest('label')?.classList.add('hidden');setOptions(thick,[],'Seleccioná un material primero...');thick.disabled=true;return;}
  if(m.variants.length){setOptions(variant,m.variants.map(v=>({label:v,value:v})),'Seleccionar color...',variant.value);variant.disabled=false;variant.closest('label')?.classList.remove('hidden');}
  else {variant.replaceChildren(new Option('Sin variante',''));variant.disabled=true;variant.closest('label')?.classList.add('hidden');}
  if(m.thicknesses.length){setOptions(thick,m.thicknesses.map(mm=>({label:`${mm} mm`,value:String(mm)})),'Seleccionar grosor...',thick.value);thick.disabled=false;}
  else {setOptions(thick,[],'Grosor pendiente de definir...');thick.disabled=true;}
  const helper=$('thicknessHelper'); if(helper)helper.textContent=m.thicknesses.length?`Disponibles: ${m.thicknesses.join(', ')} mm.`:'Todavía no se definieron grosores para este material.';
}

function showPage(pageId,button){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===pageId));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active-page',p.id===pageId));
  if(pageId==='calculatorPage'){setTimeout(()=>render3D(),0);}
}
window.showPage=showPage;

function bind(){
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page,btn)));
  $('materialFamilySelect')?.addEventListener('change',()=>{state.selectedFamilyId=$('materialFamilySelect').value;state.selectedVariant='';state.selectedMaterialId='';renderCalcVariants();renderComponents();updateBudget();});
  $('materialVariantSelect')?.addEventListener('change',()=>{state.selectedVariant=$('materialVariantSelect').value;state.selectedMaterialId='';renderCalcThicknesses();renderComponents();updateBudget();});
  $('materialThicknessSelect')?.addEventListener('change',()=>{
    const value=$('materialThicknessSelect').value;
    state.selectedMaterialId=value.startsWith('missing:')?'':value;
    updateSelectedMaterialUI();renderComponents();updateBudget();
  });
  inputIds.forEach(id=>els[id]?.addEventListener('input',()=>{renderComponents();updateBudget();}));
  $('addDivider')?.addEventListener('click',()=>{const m=dims();state.dividers.push({id:uid(),position:Math.min(300,Math.max(m.innerW-m.T,0))});renderComponents();updateBudget();});
  $('addShelf')?.addEventListener('click',()=>{state.shelves.push({id:uid(),section:0,height:300});renderComponents();updateBudget();});
  $('resetView')?.addEventListener('click',resetView);
  $('dividersList')?.addEventListener('input',e=>{const item=state.dividers.find(d=>d.id===e.target.dataset.id);if(item){item.position=Number(e.target.value)||0;renderComponents();updateBudget();}});
  $('dividersList')?.addEventListener('click',e=>{if(!e.target.classList.contains('remove-divider'))return;state.dividers=state.dividers.filter(d=>d.id!==e.target.dataset.id);state.shelves=state.shelves.map(s=>({...s,section:Math.min(s.section,state.dividers.length)}));renderComponents();updateBudget();});
  $('shelvesList')?.addEventListener('input',e=>{const item=state.shelves.find(s=>s.id===e.target.dataset.id);if(item){item.height=Number(e.target.value)||0;renderComponents();updateBudget();}});
  $('shelvesList')?.addEventListener('change',e=>{const item=state.shelves.find(s=>s.id===e.target.dataset.id);if(item){item.section=Number(e.target.value)||0;renderComponents();updateBudget();}});
  $('shelvesList')?.addEventListener('click',e=>{if(!e.target.classList.contains('remove-shelf'))return;state.shelves=state.shelves.filter(s=>s.id!==e.target.dataset.id);renderComponents();updateBudget();});
  $('materialCategory')?.addEventListener('change',renderBaseMaterialForm);
  $('materialVariant')?.addEventListener('change',renderBaseMaterialForm);
  $('materialForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const materialId=$('materialCategory').value, material=cat(materialId), variant=material?.variants.length?$('materialVariant').value:'', thickness=Number($('materialThickness').value), price=Number($('materialPrice').value);
    if(!material){alert('Seleccioná un material.');return;}
    if(material.variants.length&&!material.variants.includes(variant)){alert('Seleccioná un color / variante.');return;}
    if(!material.thicknesses.includes(thickness)){alert('Seleccioná un grosor disponible.');return;}
    if(!Number.isFinite(price)||price<0){alert('Ingresá un precio válido por m².');return;}
    const existing=state.materials.find(m=>m.materialId===materialId&&(m.variant||'')===variant&&Number(m.thickness)===thickness);
    if(existing)existing.price=price;
    else state.materials.push({id:uid(),materialId,variant,name:canonicalName({materialId,variant}),thickness,price});
    state.materials=dedupe(state.materials);saveMaterials();renderMaterialsPage();renderCalculatorMaterials();renderBaseMaterialForm();renderCalcThicknesses();updateBudget();
    $('materialPrice').value='';
  });
  $('materialsBody')?.addEventListener('input',e=>{const i=e.target.closest('.material-price');if(!i)return;const m=state.materials.find(x=>x.id===i.dataset.id);const p=Number(i.value);if(m&&Number.isFinite(p)&&p>=0){m.price=p;saveMaterials();renderCalculatorMaterials();updateBudget();}});
  $('materialsBody')?.addEventListener('click',e=>{const b=e.target.closest('.delete-material');if(!b)return;state.materials=state.materials.filter(m=>m.id!==b.dataset.id);saveMaterials();renderMaterialsPage();renderCalculatorMaterials();renderCalcThicknesses();updateBudget();});
  $('minimumPieceCost')?.addEventListener('input',()=>{state.minimumPieceCost=Math.max(Number($('minimumPieceCost').value)||0,0);saveSettings();updateBudget();});
  $('roundingUnit')?.addEventListener('input',()=>{state.roundingUnit=Math.max(Number($('roundingUnit').value)||1,1);saveSettings();updateBudget();});
  window.addEventListener('materialsUpdated',()=>{state.materials=loadMaterials();renderMaterialsPage();renderCalculatorMaterials();updateBudget();});
}

function init(){
  renderMaterialsPage();
  renderBaseMaterialForm();
  renderCalculatorMaterials();
  const min=$('minimumPieceCost'),unit=$('roundingUnit'); if(min)min.value=state.minimumPieceCost;if(unit)unit.value=state.roundingUnit;
  init3D(); bind(); renderComponents(); updateBudget();
}

document.addEventListener('DOMContentLoaded',init);
