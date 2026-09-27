
(() => {
"use strict";
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(Number(v)||0);

let records=window.readMaterials();
let settings={minimumPieceCost:4000,roundingUnit:1000};
try{const s=JSON.parse(localStorage.getItem(window.SETTINGS_KEY)||"{}"); if(Number(s.minimumPieceCost)>=0)settings.minimumPieceCost=Number(s.minimumPieceCost); if(Number(s.roundingUnit)>0)settings.roundingUnit=Number(s.roundingUnit);}catch{}

function setOptions(select,items,placeholder,value=""){
  select.replaceChildren(new Option(placeholder,"",true,!value));
  for(const item of items) select.add(new Option(item.label,item.value));
  if(value) select.value=String(value);
}
function family(){return window.getCatalog($("baseMaterial").value)}
function renderForm(){
  const f=family(), variant=$("baseVariant"), thickness=$("baseThickness");
  if(!f){
    $("baseVariantWrap").classList.add("hidden"); variant.replaceChildren(new Option("Seleccionar color...","")); variant.disabled=true;
    setOptions(thickness,[],"Seleccioná un material primero..."); thickness.disabled=true;
    $("baseAvailability").textContent="Los grosores se filtran según el material.";
    return;
  }
  if(f.variants.length){
    const old=variant.value;
    setOptions(variant,f.variants.map(v=>({label:v,value:v})),"Seleccionar color...",old);
    variant.disabled=false; $("baseVariantWrap").classList.remove("hidden");
  }else{
    variant.replaceChildren(new Option("Sin variante","",true,true)); variant.disabled=true; $("baseVariantWrap").classList.add("hidden");
  }

  let ts=Array.isArray(f.thicknesses)?[...f.thicknesses]:[];
  if(!ts.length){
    const loaded=records.filter(r=>r.materialId===f.id && (!f.variants.length || (r.variant||"")===variant.value)).map(r=>Number(r.thickness));
    ts=[...new Set(loaded)].sort((a,b)=>a-b);
  }
  if(ts.length){
    const old=thickness.value;
    setOptions(thickness,ts.map(v=>({label:`${v} mm`,value:v})),"Seleccionar grosor...",old);
    thickness.disabled=false;
    $("baseAvailability").textContent=`Disponibles: ${ts.join(", ")} mm.`;
  }else{
    setOptions(thickness,[],"Grosor pendiente de definir...");
    thickness.disabled=true;
    $("baseAvailability").textContent="Este material todavía no tiene grosores definidos.";
  }
}
function renderTable(){
  $("materialsCount").textContent=`${records.length} ${records.length===1?"material":"materiales"}`;
  const body=$("materialsBody");
  body.innerHTML=records.map(r=>`
    <tr>
      <td><strong>${esc(window.getCatalog(r.materialId)?.label||r.name)}</strong></td>
      <td>${r.variant?esc(r.variant):"—"}</td>
      <td>${r.thickness} mm</td>
      <td><div class="input-with-unit"><input class="catalog-inline price-input" data-id="${esc(r.id)}" type="number" min="0" step="100" value="${r.price}"><span>ARS</span></div></td>
      <td><button type="button" class="danger-btn delete-btn" data-id="${esc(r.id)}">Eliminar</button></td>
    </tr>`).join("");
  $("emptyMaterials").classList.toggle("hidden",records.length>0);
}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
$("baseMaterial").addEventListener("change",()=>renderForm());
$("baseVariant").addEventListener("change",()=>{ // al cambiar color, reconstruir grosores
  const old=$("baseThickness").value;
  renderForm();
  $("baseThickness").value=old;
});
$("materialForm").addEventListener("submit",e=>{
  e.preventDefault();
  const f=family();
  const variant=f?.variants.length ? $("baseVariant").value : "";
  const thickness=Number($("baseThickness").value), price=Number($("basePrice").value);
  if(!f)return alert("Seleccioná un material.");
  if(f.variants.length && !f.variants.includes(variant))return alert("Seleccioná un color / variante.");
  if(!Number.isFinite(thickness)||thickness<=0)return alert("Seleccioná un grosor.");
  if(Array.isArray(f.thicknesses)&&!f.thicknesses.includes(thickness))return alert("Ese grosor no está disponible para el material.");
  if(!Number.isFinite(price)||price<0)return alert("Ingresá un precio válido.");
  const existing=records.find(r=>r.materialId===f.id&&(r.variant||"")===variant&&Number(r.thickness)===thickness);
  if(existing) existing.price=price;
  else records.push({id:window.uid(),materialId:f.id,variant,name:window.materialName({materialId:f.id,variant}),thickness,price});
  records=records.map(window.normalizeRecord).filter(Boolean); window.saveMaterials(records); renderTable();
  $("basePrice").value="";
});
$("materialsBody").addEventListener("change",e=>{
  const input=e.target.closest(".price-input"); if(!input)return;
  const r=records.find(x=>x.id===input.dataset.id); if(!r)return;
  r.price=Math.max(Number(input.value)||0,0); window.saveMaterials(records);
});
$("materialsBody").addEventListener("click",e=>{
  const b=e.target.closest(".delete-btn"); if(!b)return;
  records=records.filter(r=>r.id!==b.dataset.id); window.saveMaterials(records); renderTable();
});
$("minimumPieceCost").value=settings.minimumPieceCost;
$("roundingUnit").value=settings.roundingUnit;
$("minimumPieceCost").addEventListener("change",()=>{settings.minimumPieceCost=Math.max(Number($("minimumPieceCost").value)||0,0);localStorage.setItem(window.SETTINGS_KEY,JSON.stringify(settings))});
$("roundingUnit").addEventListener("change",()=>{settings.roundingUnit=Math.max(Number($("roundingUnit").value)||1,1);localStorage.setItem(window.SETTINGS_KEY,JSON.stringify(settings))});

setOptions($("baseMaterial"),window.MATERIAL_CATALOG.map(m=>({label:m.label,value:m.id})),"Seleccionar material...");
renderForm();renderTable();
})();
