(() => {
  'use strict';
  const KEY = 'presupuestador_materiales_v3';
  const MATERIALS = [
    'Melamina Blanca Aglomerado',
    'Melamina Blanca MDF',
    'Melamina Color Clásico Aglomerado (Negro/Cedro)',
    'Melamina Color Nature MDF (Cedro/Roble Dakar/Roble Americano)',
    'MDF',
    'Fibroplus Blanco',
    'Fibroplus Color (Cedro/Negro)',
    'Pino',
    'Eucaliptu',
    'Fenólico',
    'Terciado Pino',
    'Enchapado Aglomerado (Cedro/Cerejeira/Paraíso/Guatambú)'
  ];
  const THICKNESS = [3,5,6,8,9,10,12,15,18,20,22,25,30,34];
  const $ = id => document.getElementById(id);
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function safeLoad() {
    try {
      const current = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(current) && current.length) return current;
      const old = JSON.parse(localStorage.getItem('presupuestador_materiales_v2'));
      if (Array.isArray(old) && old.length) return old;
      const old1 = JSON.parse(localStorage.getItem('presupuestador_materiales_v1'));
      if (Array.isArray(old1) && old1.length) return old1;
    } catch (_) {}
    return [{id:makeId(), name:'MDF', thickness:15, price:48000}];
  }

  let items = safeLoad();
  const save = () => localStorage.setItem(KEY, JSON.stringify(items));
  const esc = v => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function populateSelects() {
    const material = $('materialName');
    const thickness = $('materialThickness');
    if (material) {
      material.replaceChildren(new Option('Seleccionar material...', '', true, true));
      MATERIALS.forEach(name => material.add(new Option(name, name)));
    }
    if (thickness) {
      thickness.replaceChildren(new Option('Seleccionar grosor...', '', true, true));
      THICKNESS.forEach(mm => thickness.add(new Option(`${mm} mm`, String(mm))));
    }
  }

  function renderTable() {
    const body = $('materialsBody');
    const count = $('materialsCount');
    const empty = $('emptyMaterials');
    if (!body || !count || !empty) return;
    body.innerHTML = items.map(m => `
      <tr>
        <td>${esc(m.name)}</td>
        <td>${Number(m.thickness)} mm</td>
        <td><div class="input-with-unit"><input class="catalog-inline material-price" data-id="${esc(m.id)}" type="number" min="0" step="100" value="${Number(m.price)||0}" aria-label="Precio por m²"><span>ARS</span></div></td>
        <td><button type="button" class="danger-btn delete-material" data-id="${esc(m.id)}">Eliminar</button></td>
      </tr>`).join('');
    count.textContent = `${items.length} ${items.length === 1 ? 'material' : 'materiales'}`;
    empty.classList.toggle('hidden', items.length > 0);
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('materialsUpdated', {detail:{items}}));
  }

  function init() {
    populateSelects();
    renderTable();

    $('materialForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('materialName')?.value || '';
      const thickness = Number($('materialThickness')?.value || 0);
      const rawPrice = $('materialPrice')?.value ?? '';
      const price = Number(rawPrice);
      if (!name || !THICKNESS.includes(thickness)) {
        alert('Seleccioná un material y un grosor.');
        return;
      }
      if (rawPrice === '' || !Number.isFinite(price) || price < 0) {
        alert('Ingresá un precio válido por m².');
        $('materialPrice')?.focus();
        return;
      }
      const existing = items.find(m => m.name === name && Number(m.thickness) === thickness);
      if (existing) existing.price = price;
      else items.push({id:makeId(), name, thickness, price});
      save();
      renderTable();
      notify();
      if ($('materialPrice')) $('materialPrice').value = '';
      if ($('materialName')) $('materialName').selectedIndex = 0;
      if ($('materialThickness')) $('materialThickness').selectedIndex = 0;
    });

    $('materialsBody')?.addEventListener('input', e => {
      const input = e.target.closest('.material-price');
      if (!input) return;
      const item = items.find(m => m.id === input.dataset.id);
      const price = Number(input.value);
      if (item && Number.isFinite(price) && price >= 0) {
        item.price = price;
        save();
        notify();
      }
    });

    $('materialsBody')?.addEventListener('click', e => {
      const button = e.target.closest('.delete-material');
      if (!button) return;
      items = items.filter(m => m.id !== button.dataset.id);
      save();
      renderTable();
      notify();
    });
  }

  window.addEventListener('materialsUpdated', () => {
    // app.js listens too; this event is deliberately harmless here.
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
