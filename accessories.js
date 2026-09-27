(() => {
"use strict";
const $=id=>document.getElementById(id);
const KEY="presupuestador_accesorios_v1";
const CATS=[
 {id:"guias",label:"Guías para cajones"},
 {id:"bisagras",label:"Bisagras"},
 {id:"tiradores",label:"Tiradores"},
 {id:"soportes",label:"Soportes"},
 {id:"esquineros",label:"Esquineros / ángulos"},
 {id:"tornillos",label:"Tornillos"},
 {id:"otros",label:"Otros"}
];
let records=[];
try{
 const raw=JSON.parse(localStorage.getItem(KEY)||"[]");
 records=Array.isArray(raw)?raw.filter(x=>x&&x.categoryId&&x.name).map(x=>({
   id:x.id||uid(),categoryId:String(x.categoryId),name:String(x.name),
   guideSystem:String(x.guideSystem||""),unit:String(x.unit||"unidad"),price:Number(x.price)||0
 })):[]; 
}catch{}
function uid(){return globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function catLabel(id){return CATS.find(c=>c.id===id)?.label||id}
function save(){localStorage.setItem(KEY,JSON.stringify(records))}
function setOptions(sel,items,placeholder){
 sel.replaceChildren(new Option(placeholder,"",true,true));
 items.forEach(x=>sel.add(new Option(x.label,x.value)));
}
function renderForm(){ $("guideSystemWrap").classList.toggle("hidden",$("accessoryCategory").value!=="guias"); }
function renderTable(){
 $("accessoriesCount").textContent=`${records.length} ${records.length===1?"accesorio":"accesorios"}`;
 $("accessoriesBody").innerHTML=records.map(r=>`
  <tr><td>${esc(catLabel(r.categoryId))}</td><td><strong>${esc(r.name)}</strong></td>
  <td>${r.categoryId==="guias"?(r.guideSystem==="telescopica"?"Telescópica":"Guía Z"):"—"}</td>
  <td>${esc(r.unit||"unidad")}</td>
  <td><div class="input-with-unit"><input class="catalog-inline accessory-price" data-id="${esc(r.id)}" type="number" min="0" step="100" value="${r.price}"><span>ARS</span></div></td>
  <td><button type="button" class="danger-btn delete-accessory" data-id="${esc(r.id)}">Eliminar</button></td></tr>`).join("");
 $("emptyAccessories").classList.toggle("hidden",records.length>0);
}
$("accessoryCategory").addEventListener("change",renderForm);
$("accessoryForm").addEventListener("submit",e=>{
 e.preventDefault();
 const categoryId=$("accessoryCategory").value,name=$("accessoryName").value.trim(),
       guideSystem=categoryId==="guias"?$("guideSystem").value:"",
       unit=$("accessoryUnit").value,price=Number($("accessoryPrice").value);
 if(!categoryId)return alert("Seleccioná una categoría.");
 if(!name)return alert("Ingresá el nombre o modelo.");
 if(!Number.isFinite(price)||price<0)return alert("Ingresá un precio válido.");
 let r=records.find(x=>x.categoryId===categoryId&&x.name.toLowerCase()===name.toLowerCase()&&x.guideSystem===guideSystem);
 if(r){r.price=price;r.unit=unit;r.name=name}else records.push({id:uid(),categoryId,name,guideSystem,unit,price});
 save();renderTable();$("accessoryName").value="";$("accessoryPrice").value="";
});
$("accessoriesBody").addEventListener("change",e=>{
 const i=e.target.closest(".accessory-price");if(!i)return;
 const r=records.find(x=>x.id===i.dataset.id);if(!r)return;
 r.price=Math.max(Number(i.value)||0,0);save();
});
$("accessoriesBody").addEventListener("click",e=>{
 const b=e.target.closest(".delete-accessory");if(!b)return;
 records=records.filter(x=>x.id!==b.dataset.id);save();renderTable();
});
setOptions($("accessoryCategory"),CATS.map(c=>({label:c.label,value:c.id})),"Seleccionar categoría...");
renderForm();renderTable();
})();
