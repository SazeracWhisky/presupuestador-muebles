
const MATERIAL_CATALOG = [
  {id:"melamina_aglomerado", label:"Melamina Aglomerado", variants:["Blanco","Negro","Cedro"], thicknesses:[10,12,15,18]},
  {id:"melamina_mdf", label:"Melamina MDF", variants:["Blanco","Cedro","Roble Americano","Roble Dakar"], thicknesses:[12,15,18]},
  {id:"mdf", label:"MDF", variants:[], thicknesses:[3,5,9,12,15,18,25]},
  {id:"fibroplus", label:"Fibroplus", variants:["Blanco","Negro","Cedro"], thicknesses:[3,5]},
  {id:"pino", label:"Pino", variants:[], thicknesses:[18,22]},
  {id:"eucaliptu", label:"Eucaliptu", variants:[], thicknesses:[20,30]},
  {id:"fenolico", label:"Fenólico", variants:[], thicknesses:[6,8,10,12,15,18]},
  {id:"terciado_pino", label:"Terciado Pino", variants:[], thicknesses:[3]},
  {id:"enchapado_aglomerado", label:"Enchapado Aglomerado", variants:["Cedro","Cerejeira","Paraíso","Guatambú"], thicknesses:null}
];
const MATERIALS_KEY = "presupuestador_materiales_v3";
const SETTINGS_KEY = "presupuestador_settings_v1";

function uid(){ return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function getCatalog(id){ return MATERIAL_CATALOG.find(m=>m.id===id) || null; }
function materialName(r){
  const m=getCatalog(r.materialId);
  return m ? (r.variant ? `${m.label} · ${r.variant}` : m.label) : (r.name || "");
}
function normalizeRecord(raw){
  if(!raw || typeof raw!=="object") return null;
  let materialId=String(raw.materialId||"");
  let material=getCatalog(materialId);

  // Migración tolerante: versiones anteriores pudieron guardar el nombre en vez del id.
  if(!material && raw.name){
    const base=String(raw.name).split(" · ")[0];
    material=MATERIAL_CATALOG.find(m=>m.label===base);
    if(material) materialId=material.id;
  }
  if(!material) return null;

  let variant=String(raw.variant||"");
  if(!material.variants.includes(variant)){
    const pieces=String(raw.name||"").split(" · ");
    const maybeVariant=pieces.length>1 ? pieces[1] : "";
    variant=material.variants.includes(maybeVariant) ? maybeVariant : "";
  }
  const thickness=Number(raw.thickness);
  const price=Number(raw.price);
  if(!Number.isFinite(thickness) || thickness<=0) return null;
  if(Array.isArray(material.thicknesses) && !material.thicknesses.includes(thickness)) return null;
  if(!Number.isFinite(price) || price<0) return null;
  return {id:raw.id||uid(),materialId,variant,name:materialName({materialId,variant}),thickness,price};
}
function readMaterials(){
  const keys=[MATERIALS_KEY,"presupuestador_materiales_v2","presupuestador_materiales_v1"];
  for(const key of keys){
    try{
      const raw=JSON.parse(localStorage.getItem(key)||"null");
      if(Array.isArray(raw)){
        const list=[];
        for(const item of raw){const r=normalizeRecord(item); if(r) list.push(r);}
        if(list.length) return dedupeMaterials(list);
      }
    }catch(e){}
  }
  return [{id:uid(),materialId:"mdf",variant:"",name:"MDF",thickness:15,price:48000}];
}
function dedupeMaterials(list){
  const map=new Map();
  for(const r of list){
    map.set(`${r.materialId}|${r.variant}|${r.thickness}`,r);
  }
  return [...map.values()];
}
function saveMaterials(list){localStorage.setItem(MATERIALS_KEY,JSON.stringify(dedupeMaterials(list)));}

window.MATERIAL_CATALOG=MATERIAL_CATALOG;
window.MATERIALS_KEY=MATERIALS_KEY;
window.SETTINGS_KEY=SETTINGS_KEY;
window.materialName=materialName;
window.getCatalog=getCatalog;
window.uid=uid;
window.readMaterials=readMaterials;
window.saveMaterials=saveMaterials;
window.normalizeRecord=normalizeRecord;
