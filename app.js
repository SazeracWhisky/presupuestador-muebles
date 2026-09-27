import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'presupuestador_materiales_v2';
const inputIds = ['width','height','depth','waste','dividerOffset','leftShelfHeight','rightShelves'];
const els = Object.fromEntries(inputIds.map((id) => [id, $(id)]));
let materials = loadMaterials();
let selectedMaterialId = materials[0]?.id || '';

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadMaterials() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(current)) return current;

    // Migración desde las versiones anteriores.
    const legacy = JSON.parse(localStorage.getItem('presupuestador_materiales_v1'));
    if (Array.isArray(legacy)) return legacy;
  } catch (error) {
    console.warn('No se pudieron leer los materiales guardados.', error);
  }

  return [{ id: createId(), name: 'MDF', thickness: 15, price: 48000 }];
}

function saveMaterials() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
}

function money(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(value);
}

function numberValue(id) {
  return Number(els[id].value) || 0;
}

function currentMaterial() {
  return materials.find((material) => material.id === $('materialSelect').value) || null;
}

function renderMaterialCatalog() {
  const select = $('materialSelect');
  const body = $('materialsBody');
  const count = $('materialsCount');
  const empty = $('emptyMaterials');

  select.innerHTML = materials.length
    ? materials.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} · ${m.thickness} mm</option>`).join('')
    : '<option value="">No hay materiales cargados</option>';

  if (!materials.some((m) => m.id === selectedMaterialId)) selectedMaterialId = materials[0]?.id || '';
  if (selectedMaterialId) select.value = selectedMaterialId;

  body.innerHTML = materials.map((m) => `
    <tr>
      <td><input class="catalog-inline material-name" data-id="${escapeHtml(m.id)}" value="${escapeHtml(m.name)}" /></td>
      <td><div class="input-with-unit"><input class="catalog-inline material-thickness" data-id="${escapeHtml(m.id)}" type="number" min="1" step="1" value="${m.thickness}" /></div></td>
      <td><div class="input-with-unit"><input class="catalog-inline material-price" data-id="${escapeHtml(m.id)}" type="number" min="0" step="100" value="${m.price}" /></div></td>
      <td><button class="delete-material" data-id="${escapeHtml(m.id)}">Eliminar</button></td>
    </tr>`).join('');

  count.textContent = `${materials.length} ${materials.length === 1 ? 'material' : 'materiales'}`;
  empty.classList.toggle('hidden', materials.length > 0);
  updateSelectedMaterialUI();
}

function updateSelectedMaterialUI() {
  const material = currentMaterial();
  $('selectedThickness').textContent = material ? `${material.thickness} mm` : '—';
  $('selectedPrice').textContent = material ? money(material.price) + '/m²' : '—';
  $('materialStatus').textContent = material ? `${material.name} · ${material.thickness} mm` : 'Material no seleccionado';
  $('viewerHint').textContent = material ? `${material.name} · ${material.thickness} mm` : 'Sin material';
}

function syncThicknessFromMaterial() {
  const material = currentMaterial();
  if (!material) return;
  // El espesor ahora pertenece al material y no se modifica desde el cálculo.
}

function getModelParts() {
  const W = numberValue('width');
  const H = numberValue('height');
  const D = numberValue('depth');
  const T = Number(currentMaterial()?.thickness) || 0;
  const dividerOffset = Math.max(0, numberValue('dividerOffset'));
  const leftShelfHeight = Math.max(0, numberValue('leftShelfHeight'));
  const rightShelves = Math.max(0, Math.round(numberValue('rightShelves')));

  const innerW = Math.max(W - 2 * T, 0);
  const innerH = Math.max(H - 2 * T, 0);
  const leftClear = Math.min(dividerOffset, Math.max(innerW - T, 0));
  const rightClear = Math.max(innerW - leftClear - T, 0);
  const dividerHeight = innerH;
  const rightClearHeight = Math.max(innerH - rightShelves * T, 0);
  const rightGap = rightShelves > 0 ? rightClearHeight / (rightShelves + 1) : 0;

  // Piezas: x=ancho, y=alto, z=profundidad. Posiciones centradas en el mueble.
  const xLeft = -W / 2;
  const xInnerLeft = xLeft + T;
  const xDivider = xInnerLeft + leftClear;
  const xRightInner = xDivider + T;
  const yBottomOuter = -H / 2;
  const yInnerBottom = yBottomOuter + T;

  const parts = [
    { name: 'Lateral izquierdo', qty: 1, w: T, h: H, d: D, x: xLeft + T/2, y: 0, z: 0 },
    { name: 'Lateral derecho', qty: 1, w: T, h: H, d: D, x: W/2 - T/2, y: 0, z: 0 },
    { name: 'Tapa', qty: 1, w: innerW, h: T, d: D, x: 0, y: H/2 - T/2, z: 0 },
    { name: 'Base', qty: 1, w: innerW, h: T, d: D, x: 0, y: -H/2 + T/2, z: 0 },
    { name: 'División vertical', qty: 1, w: T, h: dividerHeight, d: D, x: xDivider + T/2, y: 0, z: 0 },
  ];

  // Estante izquierdo: su cara superior queda a leftShelfHeight sobre la cara superior de la base.
  if (leftClear > 0 && leftShelfHeight >= 0 && leftShelfHeight <= innerH) {
    const topY = yInnerBottom + leftShelfHeight;
    parts.push({ name: 'Estante izquierdo', qty: 1, w: leftClear, h: T, d: D, x: xInnerLeft + leftClear/2, y: topY - T/2, z: 0 });
  }

  // Estantes derechos: distribuyen la luz libre restante en 3...N+1 espacios iguales.
  for (let i = 0; i < rightShelves; i++) {
    const gapIndex = i + 1;
    const bottomY = yInnerBottom + rightGap * gapIndex + T * i;
    parts.push({ name: `Estante derecho ${i + 1}`, qty: 1, w: rightClear, h: T, d: D, x: xRightInner + rightClear/2, y: bottomY + T/2, z: 0 });
  }

  return { W,H,D,T,innerW,innerH,leftClear,rightClear,rightShelves,rightGap,parts };
}

function updateBudget() {
  const model = getModelParts();
  const wastePct = Math.max(0, numberValue('waste'));
  const material = currentMaterial();
  const body = $('partsBody');
  let totalArea = 0;

  body.innerHTML = model.parts.map((part) => {
    const area = (part.w * part.d) / 1_000_000 * part.qty;
    totalArea += area;
    return `<tr><td>${escapeHtml(part.name)}</td><td>${part.qty}</td><td>${part.w.toFixed(0)} × ${part.d.toFixed(0)} mm</td><td>${area.toFixed(3)}</td></tr>`;
  }).join('');

  const areaWithWaste = totalArea * (1 + wastePct/100);
  const cost = material ? areaWithWaste * material.price : NaN;

  $('areaM2').textContent = Number.isFinite(totalArea) ? `${totalArea.toFixed(3)} m²` : '—';
  $('areaWaste').textContent = Number.isFinite(areaWithWaste) ? `${areaWithWaste.toFixed(3)} m²` : '—';
  $('priceM2Label').textContent = material ? `${money(material.price)} / m²` : '—';
  $('materialCost').textContent = Number.isFinite(cost) ? money(cost) : '—';
  $('budgetNote').textContent = material
    ? `Cálculo de tablero por superficie de piezas cortadas a medida. El espesor seleccionado es ${material.thickness} mm. Todavía no se incluyen corte, canteado, herrajes, mano de obra, traslado ni margen.`
    : 'Seleccioná un material desde la Base de materiales para activar el cálculo.';
}

// ---------------------------
// Visor 3D Three.js
// ---------------------------
let scene, camera, renderer, controls, modelGroup;

function initViewer() {
  const container = $('viewer');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f7f5);

  camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.01, 100);
  camera.position.set(3.2, 2.7, 3.6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);
  controls.minZoom = 0.6;
  controls.maxZoom = 4.0;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x787878, 1.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShadowMaterial({ opacity: 0.10 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  floor.receiveShadow = true;
  scene.add(floor);

  modelGroup = new THREE.Group();
  scene.add(modelGroup);
  resizeViewer();
  window.addEventListener('resize', resizeViewer);

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function buildModel() {
  if (!modelGroup) return;
  while (modelGroup.children.length) {
    const object = modelGroup.children.pop();
    object.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }

  const model = getModelParts();
  if (!model.T || !model.W || !model.H || !model.D) return;

  // Escala: trabajamos en metros para mantener proporciones físicas reales.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcfc8bd,
    roughness: 0.78,
    metalness: 0.02
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x5e5a53, transparent: true, opacity: 0.58 });

  const scale = 1 / 1000;
  for (const part of model.parts) {
    const geometry = new THREE.BoxGeometry(part.w * scale, part.h * scale, part.d * scale);
    geometry.translate(0, 0, 0);
    const mesh = new THREE.Mesh(geometry, mat.clone());
    mesh.position.set(part.x * scale, part.y * scale, part.z * scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { name: part.name, dimensions: [part.w, part.h, part.d] };
    modelGroup.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), edgeMat.clone());
    edges.position.copy(mesh.position);
    modelGroup.add(edges);
  }

  // Una ligera base visual para separar el mueble del fondo sin inventar un fondo posterior.
  const outer = new THREE.Box3().setFromObject(modelGroup);
  const center = outer.getCenter(new THREE.Vector3());
  modelGroup.position.sub(center);
  fitCameraToModel(modelGroup);
}

function fitCameraToModel(group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const margin = 1.45;
  const view = Math.max(maxDim * margin, 1.2);
  camera.left = -view;
  camera.right = view;
  camera.top = view * 0.72;
  camera.bottom = -view * 0.72;
  camera.updateProjectionMatrix();
}

function resetCamera() {
  if (!camera || !controls) return;
  camera.position.set(3.2, 2.7, 3.6);
  controls.target.set(0, 0, 0);
  controls.reset();
  fitCameraToModel(modelGroup);
}

function resizeViewer() {
  if (!renderer || !camera) return;
  const container = $('viewer');
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 560;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const currentHeight = Math.abs(camera.top - camera.bottom);
  camera.left = -currentHeight * aspect / 2;
  camera.right = currentHeight * aspect / 2;
  camera.updateProjectionMatrix();
}

function update3DAndUI() {
  updateSelectedMaterialUI();
  const model = getModelParts();
  $('viewerSize').textContent = `${model.W} × ${model.H} × ${model.D} mm`;
  $('dimensions').innerHTML = [
    ['Interior útil', `${model.innerW.toFixed(0)} mm`],
    ['Módulo izquierdo', `${model.leftClear.toFixed(0)} mm`],
    ['Módulo derecho', `${model.rightClear.toFixed(0)} mm`],
    ['Espesor real', `${model.T.toFixed(0)} mm`]
  ].map(([label, value]) => `<div class="dimension-card"><span>${label}</span><strong>${value}</strong></div>`).join('');

  const warning = $('warning');
  if (!currentMaterial()) {
    warning.classList.remove('hidden');
    warning.textContent = 'No hay un material seleccionado. Cargá uno en la Base de materiales para continuar.';
  } else if (model.rightClear < 200) {
    warning.classList.remove('hidden');
    warning.textContent = `Atención: el espacio interior libre del módulo derecho queda en ${model.rightClear.toFixed(0)} mm. Se muestra como advertencia, no como error.`;
  } else {
    warning.classList.add('hidden');
    warning.textContent = '';
  }

  buildModel();
  updateBudget();
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach((page) => page.classList.remove('active-page'));
      button.classList.add('active');
      $(button.dataset.page).classList.add('active-page');
      if (button.dataset.page === 'calculatorPage') setTimeout(resizeViewer, 20);
    });
  });

  inputIds.forEach((id) => els[id].addEventListener('input', update3DAndUI));

  $('materialSelect').addEventListener('change', () => {
    selectedMaterialId = $('materialSelect').value;
    syncThicknessFromMaterial();
    update3DAndUI();
  });

  $('addMaterial').addEventListener('click', () => {
    const name = $('materialName').value.trim();
    const thickness = Number($('materialThickness').value);
    const price = Number($('materialPrice').value);

    if (!name || !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(price) || price < 0) {
      alert('Completá material, grosor y valor por m².');
      return;
    }

    const newMaterial = { id: createId(), name, thickness, price };
    materials.push(newMaterial);
    selectedMaterialId = newMaterial.id;
    saveMaterials();
    $('materialName').value = '';
    $('materialThickness').value = '';
    $('materialPrice').value = '';
    renderMaterialCatalog();
    $('materialSelect').value = selectedMaterialId;
    update3DAndUI();
  });

  $('materialsBody').addEventListener('click', (event) => {
    const button = event.target.closest('.delete-material');
    if (!button) return;
    const id = button.dataset.id;
    materials = materials.filter((m) => m.id !== id);
    if (selectedMaterialId === id) selectedMaterialId = materials[0]?.id || '';
    saveMaterials();
    renderMaterialCatalog();
    update3DAndUI();
  });

  $('materialsBody').addEventListener('change', (event) => {
    const input = event.target.closest('.catalog-inline');
    if (!input) return;
    const material = materials.find((m) => m.id === input.dataset.id);
    if (!material) return;

    if (input.classList.contains('material-name')) material.name = input.value.trim() || material.name;
    if (input.classList.contains('material-thickness')) material.thickness = Math.max(1, Number(input.value) || 1);
    if (input.classList.contains('material-price')) material.price = Math.max(0, Number(input.value) || 0);
    saveMaterials();
    renderMaterialCatalog();
    $('materialSelect').value = selectedMaterialId;
    update3DAndUI();
  });

  $('resetView').addEventListener('click', resetCamera);
}

renderMaterialCatalog();
initViewer();
bindEvents();
update3DAndUI();
