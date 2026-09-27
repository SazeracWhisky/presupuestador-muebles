let THREE = null;
let OrbitControls = null;
const $ = (id) => document.getElementById(id);
const MATERIALS_KEY = 'presupuestador_materiales_v3';
const SETTINGS_KEY = 'presupuestador_settings_v1';
const MODEL_KEY = 'presupuestador_model_v1';
const state = {
  materials: loadMaterials(),
  selectedMaterialId: '',
  selectedFamilyId: '',
  selectedVariant: '',
  selectedThickness: '',
  dividers: [{ id: cryptoId(), position: 470 }],
  shelves: [
    { id: cryptoId(), section: 0, height: 350 },
    { id: cryptoId(), section: 1, height: 235 },
    { id: cryptoId(), section: 1, height: 470 }
  ],
  minimumPieceCost: 4000,
  roundingUnit: 1000
};

const inputIds = ['width','height','depth','waste'];
const els = Object.fromEntries(inputIds.map((id) => [id, $(id)]));

function cryptoId(){ return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function money(v){ return Number.isFinite(v) ? new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v) : '—'; }
function numberValue(id){ return Number(els[id]?.value) || 0; }
function escapeHtml(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function loadMaterials(){
  try {
    const current=JSON.parse(localStorage.getItem(MATERIALS_KEY));
    if(Array.isArray(current)) return current;
    const v2=JSON.parse(localStorage.getItem('presupuestador_materiales_v2'));
    if(Array.isArray(v2)) return v2;
    const v1=JSON.parse(localStorage.getItem('presupuestador_materiales_v1'));
    if(Array.isArray(v1)) return v1;
  } catch{}
  return [];
}

function loadSettings(){ try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }catch{return{};} }
function saveMaterials(){ localStorage.setItem(MATERIALS_KEY, JSON.stringify(state.materials)); }
function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify({minimumPieceCost:state.minimumPieceCost,roundingUnit:state.roundingUnit})); }
function currentMaterial(){
  const id = $('materialThicknessSelect')?.value || state.selectedMaterialId || '';
  return state.materials.find(m => m.id === id) || null;
}

function catalogFamilies(){
  const rows = state.materials.filter(m => m && m.materialId);
  const ids = [...new Set(rows.map(m => m.materialId))];
  return ids.map(materialId => {
    const first = rows.find(r => r.materialId === materialId);
    return { id: materialId, label: first?.name?.split(' · ')[0] || materialId };
  });
}

function familyRows(){
  const familyId = $('materialFamilySelect')?.value || state.selectedFamilyId || '';
  return state.materials.filter(m => m.materialId === familyId);
}

function variantRows(){
  return familyRows().map(m => (m.variant || '')).filter((v,i,a) => a.indexOf(v)===i).sort((a,b)=>String(a).localeCompare(String(b),'es'));
}

function canonicalName(m){
  if(!m) return '';
  return m.variant ? `${m.name?.split(' · ')[0] || m.name} · ${m.variant}` : (m.name || '');
}

function setSelectOptions(select, rows, placeholder){
  if(!select) return;
  select.innerHTML='';
  select.add(new Option(placeholder,'',true,true));
  rows.forEach(row => select.add(new Option(row.label, row.value)));
}

function renderMaterialOptions(){
  const familySelect=$('materialFamilySelect');
  if(!familySelect) return;
  const families=catalogFamilies();
  const previous=state.selectedFamilyId || familySelect.value || '';
  setSelectOptions(familySelect, families.map(f=>({label:f.label,value:f.id})),'Seleccionar material...');
  const next=families.some(f=>f.id===previous)?previous:(families[0]?.id||'');
  state.selectedFamilyId=next;
  familySelect.value=next;
  renderVariantOptions();
}

function renderVariantOptions(){
  const familyRowsList=familyRows();
  const variantSelect=$('materialVariantSelect');
  const label=$('calcVariantLabel');
  if(!variantSelect) return;
  const variants=variantRows();
  if(!variants.length){
    variantSelect.innerHTML='';
    variantSelect.add(new Option('Sin variante','',true,true));
    variantSelect.disabled=true;
    label?.classList.add('hidden');
    state.selectedVariant='';
  } else {
    variantSelect.disabled=false;
    label?.classList.remove('hidden');
    const previous=state.selectedVariant;
    setSelectOptions(variantSelect, variants.map(v=>({label:v,value:v})),'Seleccionar color...');
    const next=variants.includes(previous)?previous:variants[0];
    state.selectedVariant=next;
    variantSelect.value=next;
  }
  renderThicknessOptions();
}

function renderThicknessOptions(){
  const select=$('materialThicknessSelect');
  if(!select) return;
  let rows=familyRows();
  if(state.selectedVariant || variantRows().length){
    rows=rows.filter(m => (m.variant || '') === (state.selectedVariant || ''));
  }
  rows=[...rows].sort((a,b)=>Number(a.thickness)-Number(b.thickness));
  const previous=state.selectedThickness;
  const unique=rows.filter((m,i,a)=>a.findIndex(x=>x.thickness===m.thickness)===i);
  setSelectOptions(select, unique.map(m=>({label:`${m.thickness} mm · ${money(Number(m.price)||0)}/m²`,value:m.id})),'Seleccionar grosor...');
  const found=unique.find(m=>m.id===previous) || unique[0] || null;
  state.selectedThickness=found?.id || '';
  state.selectedMaterialId=found?.id || '';
  select.value=found?.id || '';
  updateSelectedMaterialUI();
}

function renderMaterialCatalog(){
  state.materials=state.materials.filter(m => m && m.materialId && Number.isFinite(Number(m.thickness)) && Number.isFinite(Number(m.price)));
  renderMaterialOptions();
  const min=$('minimumPieceCost');
  const unit=$('roundingUnit');
  if(min) min.value=state.minimumPieceCost;
  if(unit) unit.value=state.roundingUnit;
  const count=$('materialsCount');
  if(count) count.textContent=`${state.materials.length} materiales`;
}

function updateSelectedMaterialUI(){
  const material=currentMaterial();
  $('selectedThickness').textContent=material?`${material.thickness} mm`:'—';
  $('selectedPrice').textContent=material?`${money(Number(material.price)||0)}/m²`:'—';
  const label=material ? (material.name || canonicalName(material)) : '';
  $('materialStatus').textContent=material?`${label} · ${material.thickness} mm`:'Material no seleccionado';
  $('viewerMaterial').textContent=material?`${label} · ${material.thickness} mm`:'Sin material';
}

function dims(){
  const W=numberValue('width'), H=numberValue('height'), D=numberValue('depth'), T=Number(currentMaterial()?.thickness)||0;
  const innerW=Math.max(W-2*T,0), innerH=Math.max(H-2*T,0);
  return {W,H,D,T,innerW,innerH};
}

function normalizeDividers(model){
  const maxPos=Math.max(model.innerW-model.T,0);
  state.dividers=state.dividers
    .map(d=>({...d,position:Math.min(Math.max(Number(d.position)||0,maxPos>0?0:0),maxPos)}))
    .sort((a,b)=>a.position-b.position);
}

function sections(model){
  normalizeDividers(model);
  const edges=[0,...state.dividers.map(d=>d.position),model.innerW];
  const result=[];
  for(let i=0;i<edges.length-1;i++){
    const left=i===0?0:edges[i]+model.T;
    const right=i===edges.length-2?model.innerW:edges[i+1];
    result.push({index:i,left,right,width:Math.max(right-left,0)});
  }
  return result;
}

function roundingCost(raw){
  const min=Number(state.minimumPieceCost)||0;
  const unit=Math.max(Number(state.roundingUnit)||1,1);
  if(raw<=0) return 0;
  return Math.ceil(Math.max(raw,min)/unit)*unit;
}

function getModel(){
  const model=dims();
  const secs=sections(model);
  const parts=[];
  if(!model.T||!model.W||!model.H||!model.D) return {...model,sections:secs,parts};

  // Caja sin fondo. Tapa/base entre laterales.
  parts.push({name:'Lateral izquierdo',qty:1,w:model.T,h:model.H,d:model.D,x:-model.W/2+model.T/2,y:0,z:0,type:'panel'});
  parts.push({name:'Lateral derecho',qty:1,w:model.T,h:model.H,d:model.D,x:model.W/2-model.T/2,y:0,z:0,type:'panel'});
  parts.push({name:'Tapa',qty:1,w:model.innerW,h:model.T,d:model.D,x:0,y:model.H/2-model.T/2,z:0,type:'panel'});
  parts.push({name:'Base',qty:1,w:model.innerW,h:model.T,d:model.D,x:0,y:-model.H/2+model.T/2,z:0,type:'panel'});

  state.dividers.forEach((d,i)=>{
    const xLeft=-model.innerW/2 + d.position;
    parts.push({name:`División vertical ${i+1}`,qty:1,w:model.T,h:Math.max(model.innerH,0),d:model.D,x:xLeft+model.T/2,y:0,z:0,type:'divider'});
  });

  state.shelves.forEach((s,i)=>{
    const sec=secs[Math.min(Math.max(Math.round(Number(s.section)||0),0),Math.max(secs.length-1,0))];
    const height=Math.max(0,Number(s.height)||0);
    const y=-model.H/2+model.T+height+model.T/2;
    parts.push({name:`Estante ${i+1}`,qty:1,w:sec.width,h:model.T,d:model.D,x:-model.innerW/2+sec.left+sec.width/2,y,z:0,type:'shelf',section:sec.index});
  });
  return {...model,sections:secs,parts};
}

function renderComponents(){
  const model=dims();
  normalizeDividers(model);
  const divBody=$('dividersList');
  divBody.innerHTML=state.dividers.length ? state.dividers.map((d,i)=>`<div class="component-row">
    <label>División ${i+1}<div class="input-with-unit"><input class="divider-position" data-id="${d.id}" type="number" min="0" max="${Math.max(model.innerW-model.T,0)}" step="1" value="${Math.round(d.position)}"><span>mm</span></div></label>
    <div class="muted">desde interior izquierdo</div>
    <button class="danger-btn remove-divider" data-id="${d.id}">Eliminar</button>
  </div>`).join('') : '<div class="empty-state">Sin divisiones verticales.</div>';

  const secs=model.T ? sections(model) : [];
  const shelfBody=$('shelvesList');
  shelfBody.innerHTML=state.shelves.length ? state.shelves.map((s,i)=>`<div class="component-row shelf">
    <label>Estante ${i+1}<select class="shelf-section" data-id="${s.id}">${secs.map(sec=>`<option value="${sec.index}" ${Number(s.section)===sec.index?'selected':''}>Módulo ${sec.index+1} · ${Math.round(sec.width)} mm</option>`).join('')}</select></label>
    <label>Altura desde base<div class="input-with-unit"><input class="shelf-height" data-id="${s.id}" type="number" min="0" max="${Math.max(model.innerH-model.T,0)}" step="1" value="${Math.round(s.height)}"><span>mm</span></div></label>
    <button class="danger-btn remove-shelf" data-id="${s.id}">Eliminar</button>
  </div>`).join('') : '<div class="empty-state">Sin estantes horizontales.</div>';
}

function updateBudget(){
  const model=getModel();
  const material=currentMaterial();
  let area=0, cost=0;
  const body=$('partsBody');
  body.innerHTML=model.parts.map(p=>{
    const oneArea=(p.w*p.d)/1_000_000;
    const totalArea=oneArea*p.qty;
    area+=totalArea;
    const raw=material?oneArea*material.price:NaN;
    const line=material?roundingCost(raw)*p.qty:NaN;
    if(Number.isFinite(line)) cost+=line;
    return `<tr><td>${escapeHtml(p.name)}</td><td>${p.qty}</td><td>${p.w.toFixed(0)} × ${p.d.toFixed(0)} mm</td><td>${totalArea.toFixed(3)} m²</td><td>${Number.isFinite(line)?money(line):'—'}</td></tr>`;
  }).join('');
  const wastePct=Math.max(0,numberValue('waste'));
  const areaWaste=area*(1+wastePct/100);
  $('areaM2').textContent=`${area.toFixed(3)} m²`;
  $('areaWaste').textContent=`${areaWaste.toFixed(3)} m²`;
  $('priceM2Label').textContent=material?`${money(material.price)} / m²`: '—';
  $('materialCost').textContent=material?money(cost):'—';
  $('totalCost').textContent=material?money(cost):'—';
  $('innerWidth').textContent=`${Math.max(model.innerW,0).toFixed(0)} mm`;
  $('innerHeight').textContent=`${Math.max(model.innerH,0).toFixed(0)} mm`;
  $('dividerCount').textContent=String(state.dividers.length);
  $('shelfCount').textContent=String(state.shelves.length);
  $('viewerDimensions').textContent=`${model.W.toFixed(0)} × ${model.H.toFixed(0)} × ${model.D.toFixed(0)} mm`;
  const warning=[];
  model.sections.forEach(sec=>{ if(sec.width<100) warning.push(`Módulo ${sec.index+1} tiene solo ${sec.width.toFixed(0)} mm de ancho libre.`); });
  state.shelves.forEach((s,i)=>{ if(Number(s.height)<0 || Number(s.height)>model.innerH-model.T) warning.push(`El estante ${i+1} está fuera del alto interior.`); });
  $('modelWarning').textContent=warning.join(' ');
  $('modelWarning').classList.toggle('hidden',warning.length===0);
  const wasteNote=material && wastePct>0 ? ` El desperdicio se muestra como referencia sobre el área neta; el costo se calcula por pieza con la regla del proveedor.` : ` El costo se calcula por pieza con mínimo de ${money(state.minimumPieceCost)} y redondeo a ${money(state.roundingUnit)}.`;
  $('budgetNote').textContent=material ? `Superficie neta de piezas: ${area.toFixed(3)} m².${wasteNote}` : 'Seleccioná un material desde la Base de materiales para activar el cálculo.';
  buildModel();
}

let scene,camera,renderer,controls,modelGroup;
async function initViewer(){
  try {
    const threeMod = await import('https://unpkg.com/three@0.180.0/build/three.module.js');
    const controlsMod = await import('https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js');
    THREE = threeMod;
    OrbitControls = controlsMod.OrbitControls;
  } catch (error) {
    console.warn('El visor 3D no pudo cargar. El cálculo y la base de materiales seguirán funcionando.', error);
    const viewer=$('viewer');
    if(viewer) viewer.innerHTML='<div style="height:100%;display:grid;place-items:center;padding:30px;text-align:center;color:#737373;font-size:13px">El visor 3D no pudo cargar en este momento.<br>La base de materiales y el cálculo siguen funcionando.</div>';
    return;
  }
  const container=$('viewer');
  scene=new THREE.Scene(); scene.background=new THREE.Color(0xf7f7f5);
  camera=new THREE.PerspectiveCamera(36,1,0.01,100);
  camera.position.set(2.4,2.0,2.8);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true; controls.enablePan=false; controls.minDistance=.25; controls.maxDistance=10; controls.target.set(0,0,0);

  scene.add(new THREE.HemisphereLight(0xffffff,0x6f6f6f,2.1));
  const key=new THREE.DirectionalLight(0xffffff,3.3); key.position.set(4,6,5); key.castShadow=true; key.shadow.mapSize.set(1024,1024); scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,1.1); fill.position.set(-4,3,-3); scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.ShadowMaterial({opacity:.12})); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; floor.position.y=-.02; scene.add(floor);
  modelGroup=new THREE.Group(); scene.add(modelGroup);
  resizeViewer(); window.addEventListener('resize',resizeViewer);
  const animate=()=>{ controls.update(); renderer.render(scene,camera); requestAnimationFrame(animate); }; requestAnimationFrame(animate);
}

function buildModel(){
  if(!THREE || !modelGroup) return;
  while(modelGroup.children.length){ const o=modelGroup.children.pop(); o.traverse?.(c=>{if(c.geometry)c.geometry.dispose();if(c.material){Array.isArray(c.material)?c.material.forEach(m=>m.dispose()):c.material.dispose();}}); }
  const model=getModel(); const material=currentMaterial(); if(!model.W||!model.H||!model.D||!model.T) return;
  const woodColor=material?.name?.toLowerCase().includes('madera')?0xb88b5a:0xcfc8bd;
  const meshMat=new THREE.MeshStandardMaterial({color:woodColor,roughness:.62,metalness:.02});
  const edgeMat=new THREE.LineBasicMaterial({color:0x4d4a44,transparent:true,opacity:.58});
  const s=.001;
  model.parts.forEach(p=>{
    const geom=new THREE.BoxGeometry(p.w*s,p.h*s,p.d*s);
    const mesh=new THREE.Mesh(geom,meshMat.clone()); mesh.position.set(p.x*s,p.y*s,p.z*s); mesh.castShadow=true; mesh.receiveShadow=true; modelGroup.add(mesh);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geom,.6),edgeMat); edges.position.copy(mesh.position); modelGroup.add(edges);
  });
  const box=new THREE.Box3().setFromObject(modelGroup); const center=box.getCenter(new THREE.Vector3()); modelGroup.position.sub(center); fitCameraToModel();
}
function fitCameraToModel(){
  const box=new THREE.Box3().setFromObject(modelGroup); if(box.isEmpty())return; const size=box.getSize(new THREE.Vector3()); const maxDim=Math.max(size.x,size.y,size.z); const distance=Math.max(maxDim*2.2,.8); camera.position.set(distance*.9,distance*.78,distance*1.15); controls.target.set(0,0,0); camera.lookAt(0,0,0); camera.near=Math.max(distance/1000,.01); camera.far=distance*20; camera.updateProjectionMatrix();
}
function resizeViewer(){ if(!renderer||!camera)return; const c=$('viewer'); const w=c.clientWidth||800,h=c.clientHeight||560; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
function resetView(){ fitCameraToModel(); controls.reset(); }

function bind(){
  // La navegación principal también tiene un fallback inline en index.html.
  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const pageId=btn.dataset.page;
    if(typeof window.showPage==='function') window.showPage(pageId,btn);
    else {
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b===btn));
      document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active-page',p.id===pageId));
    }
    if(pageId==='calculatorPage'){ setTimeout(()=>{resizeViewer();buildModel();},0); }
  }));
  window.addEventListener('calculatorPageShown',()=>{setTimeout(()=>{resizeViewer();buildModel();},0);});
  $('materialFamilySelect').addEventListener('change',()=>{state.selectedFamilyId=$('materialFamilySelect').value; state.selectedVariant=''; state.selectedThickness=''; renderVariantOptions(); renderComponents(); updateBudget();});
  $('materialVariantSelect').addEventListener('change',()=>{state.selectedVariant=$('materialVariantSelect').value; state.selectedThickness=''; renderThicknessOptions(); renderComponents(); updateBudget();});
  $('materialThicknessSelect').addEventListener('change',()=>{state.selectedMaterialId=$('materialThicknessSelect').value; state.selectedThickness=state.selectedMaterialId; updateSelectedMaterialUI(); renderComponents(); updateBudget();});
  window.addEventListener('materialsUpdated',()=>{state.materials=loadMaterials(); renderMaterialCatalog(); updateBudget();});
  inputIds.forEach(id=>els[id].addEventListener('input',()=>{renderComponents();updateBudget();}));
  $('addDivider').addEventListener('click',()=>{const model=dims();state.dividers.push({id:cryptoId(),position:Math.min(300,Math.max(model.innerW-model.T,0))});renderComponents();updateBudget();});
  $('addShelf').addEventListener('click',()=>{state.shelves.push({id:cryptoId(),section:0,height:300});renderComponents();updateBudget();});
  $('resetView').addEventListener('click',resetView);
  $('dividersList').addEventListener('input',e=>{const id=e.target.dataset.id;if(!id)return; const item=state.dividers.find(d=>d.id===id);if(item){item.position=Number(e.target.value)||0;renderComponents();updateBudget();}});
  $('dividersList').addEventListener('click',e=>{if(!e.target.classList.contains('remove-divider'))return;state.dividers=state.dividers.filter(d=>d.id!==e.target.dataset.id);state.shelves=state.shelves.map(s=>({...s,section:Math.min(s.section,state.dividers.length)}));renderComponents();updateBudget();});
  $('shelvesList').addEventListener('input',e=>{const id=e.target.dataset.id;if(!id)return; const item=state.shelves.find(s=>s.id===id);if(item){item.height=Number(e.target.value)||0;updateBudget();}});
  $('shelvesList').addEventListener('change',e=>{const id=e.target.dataset.id;if(!id)return; const item=state.shelves.find(s=>s.id===id);if(item){item.section=Number(e.target.value)||0;updateBudget();renderComponents();}});
  $('shelvesList').addEventListener('click',e=>{if(!e.target.classList.contains('remove-shelf'))return;state.shelves=state.shelves.filter(s=>s.id!==e.target.dataset.id);renderComponents();updateBudget();});
  $('minimumPieceCost').addEventListener('input',()=>{state.minimumPieceCost=Math.max(Number($('minimumPieceCost').value)||0,0);saveSettings();updateBudget();});
  $('roundingUnit').addEventListener('input',()=>{state.roundingUnit=Math.max(Number($('roundingUnit').value)||1,1);saveSettings();updateBudget();});
}

try { renderMaterialCatalog(); } catch (error) { console.error('Error al cargar el catálogo:', error); }
try { initViewer(); } catch (error) { console.error('Error al iniciar el visor:', error); }
bind();
renderComponents();
updateBudget();
