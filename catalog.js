(() => {
  'use strict';

  const KEY = 'presupuestador_materiales_v3';
  const THICKNESS_ALL = [3, 5, 6, 8, 9, 10, 12, 15, 18, 20, 22, 25, 30, 34];

  // Catálogo maestro definido según la disponibilidad indicada por el usuario.
  // Enchapado Aglomerado queda con grosor pendiente de definir porque no se indicó
  // una lista de espesores todavía.
  const CATALOG = [
    {
      id: 'melamina_aglomerado',
      label: 'Melamina Aglomerado',
      variants: ['Blanco', 'Negro', 'Cedro'],
      thicknesses: [10, 12, 15, 18]
    },
    {
      id: 'melamina_mdf',
      label: 'Melamina MDF',
      variants: ['Blanco', 'Cedro', 'Roble Americano', 'Roble Dakar'],
      thicknesses: [12, 15, 18]
    },
    {
      id: 'mdf',
      label: 'MDF',
      variants: [],
      thicknesses: [3, 5, 9, 12, 15, 18, 25]
    },
    {
      id: 'fibroplus',
      label: 'Fibroplus',
      variants: ['Blanco', 'Negro', 'Cedro'],
      thicknesses: [3, 5]
    },
    {
      id: 'pino',
      label: 'Pino',
      variants: [],
      thicknesses: [18, 22]
    },
    {
      id: 'eucaliptu',
      label: 'Eucaliptu',
      variants: [],
      thicknesses: [20, 30]
    },
    {
      id: 'fenolico',
      label: 'Fenólico',
      variants: [],
      thicknesses: [6, 8, 10, 12, 15, 18]
    },
    {
      id: 'terciado_pino',
      label: 'Terciado Pino',
      variants: [],
      thicknesses: [3]
    },
    {
      id: 'enchapado_aglomerado',
      label: 'Enchapado Aglomerado',
      variants: ['Cedro', 'Cerejeira', 'Paraíso', 'Guatambú'],
      thicknesses: null
    }
  ];

  const $ = id => document.getElementById(id);
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = v => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function findMaterial(id) {
    return CATALOG.find(m => m.id === id) || null;
  }

  function buildName(materialId, variant = '') {
    const material = findMaterial(materialId);
    if (!material) return '';
    return variant ? `${material.label} · ${variant}` : material.label;
  }

  function migrateOldRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const oldName = String(raw.name || '').trim();
    const oldThickness = Number(raw.thickness);
    const price = Number(raw.price);

    // Already migrated / canonical record.
    if (raw.materialId && findMaterial(raw.materialId)) {
      const material = findMaterial(raw.materialId);
      const variant = material.variants.includes(raw.variant) ? raw.variant : '';
      return {
        id: raw.id || makeId(),
        materialId: material.id,
        variant,
        name: buildName(material.id, variant),
        thickness: Number.isFinite(oldThickness) && material.thicknesses?.includes(oldThickness) ? oldThickness : (material.thicknesses?.[0] ?? null),
        price: Number.isFinite(price) ? price : 0
      };
    }

    // Compatibility with V1.0 structured records.
    const oldCategory = String(raw.categoryId || '');
    const oldMaterialId = String(raw.materialId || '');
    if (oldCategory === 'melamina_aglomerado') {
      const variant = oldMaterialId === 'blanca' ? 'Blanco' : oldMaterialId === 'color_clasico' ? (String(oldName).includes('Negro') ? 'Negro' : String(oldName).includes('Cedro') ? 'Cedro' : '') : '';
      return { id: raw.id || makeId(), materialId: 'melamina_aglomerado', variant, name: buildName('melamina_aglomerado', variant), thickness: Number.isFinite(oldThickness) ? oldThickness : null, price: Number.isFinite(price) ? price : 0 };
    }
    if (oldCategory === 'melamina_mdf') {
      const variant = oldMaterialId === 'blanca' ? 'Blanco' : oldMaterialId === 'color_nature' ? (String(oldName).includes('Cedro') ? 'Cedro' : String(oldName).includes('Roble Dakar') ? 'Roble Dakar' : String(oldName).includes('Roble Americano') ? 'Roble Americano' : '') : '';
      return { id: raw.id || makeId(), materialId: 'melamina_mdf', variant, name: buildName('melamina_mdf', variant), thickness: Number.isFinite(oldThickness) ? oldThickness : null, price: Number.isFinite(price) ? price : 0 };
    }
    if (oldCategory === 'otros') {
      const map = {
        mdf: 'mdf',
        fibroplus_blanco: 'fibroplus',
        fibroplus_color: 'fibroplus',
        pino: 'pino',
        eucaliptu: 'eucaliptu',
        fenolico: 'fenolico',
        terciado_pino: 'terciado_pino',
        enchapado_aglomerado: 'enchapado_aglomerado'
      };
      const materialId = map[oldMaterialId];
      if (materialId) {
        let variant = '';
        if (oldMaterialId === 'fibroplus_blanco') variant = 'Blanco';
        if (oldMaterialId === 'fibroplus_color') variant = String(oldName).includes('Negro') ? 'Negro' : String(oldName).includes('Cedro') ? 'Cedro' : '';
        if (oldMaterialId === 'enchapado_aglomerado') {
          variant = ['Cedro','Cerejeira','Paraíso','Guatambú'].find(v => String(oldName).includes(v)) || '';
        }
        return { id: raw.id || makeId(), materialId, variant, name: buildName(materialId, variant), thickness: Number.isFinite(oldThickness) ? oldThickness : null, price: Number.isFinite(price) ? price : 0 };
      }
    }

    // Compatibility with older flat names.
    const flatMap = [
      ['Melamina Blanca Aglomerado', 'melamina_aglomerado', 'Blanco'],
      ['Melamina Blanca MDF', 'melamina_mdf', 'Blanco'],
      ['Melamina Color Clásico Aglomerado', 'melamina_aglomerado', ''],
      ['Melamina Color Nature MDF', 'melamina_mdf', ''],
      ['MDF', 'mdf', ''],
      ['Fibroplus Blanco', 'fibroplus', 'Blanco'],
      ['Fibroplus Color', 'fibroplus', ''],
      ['Pino', 'pino', ''],
      ['Eucaliptu', 'eucaliptu', ''],
      ['Fenólico', 'fenolico', ''],
      ['Terciado Pino', 'terciado_pino', ''],
      ['Enchapado Aglomerado', 'enchapado_aglomerado', '']
    ];
    const match = flatMap.find(([prefix]) => oldName === prefix || oldName.startsWith(`${prefix} (`) || oldName.startsWith(`${prefix} ·`));
    if (!match) return null;

    let [, materialId, variant] = match;
    const candidates = findMaterial(materialId)?.variants || [];
    const foundVariant = candidates.find(v => oldName.includes(v));
    if (foundVariant) variant = foundVariant;

    return { id: raw.id || makeId(), materialId, variant, name: buildName(materialId, variant), thickness: Number.isFinite(oldThickness) ? oldThickness : null, price: Number.isFinite(price) ? price : 0 };
  }

  function dedupe(items) {
    const map = new Map();
    items.forEach(item => {
      if (!item || !findMaterial(item.materialId)) return;
      const thicknessKey = item.thickness == null ? 'none' : Number(item.thickness);
      const key = `${item.materialId}||${item.variant || ''}||${thicknessKey}`;
      map.set(key, { ...item, name: buildName(item.materialId, item.variant || '') });
    });
    return Array.from(map.values());
  }

  function safeLoad() {
    const keys = [KEY, 'presupuestador_materiales_v2', 'presupuestador_materiales_v1'];
    for (const key of keys) {
      try {
        const raw = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(raw) && raw.length) {
          const migrated = dedupe(raw.map(migrateOldRecord).filter(Boolean));
          if (migrated.length) return migrated;
        }
      } catch (_) {}
    }

    // Base inicial solicitada previamente.
    return [{
      id: makeId(),
      materialId: 'mdf',
      variant: '',
      name: 'MDF',
      thickness: 15,
      price: 48000
    }];
  }

  let items = safeLoad();
  localStorage.setItem(KEY, JSON.stringify(items));
  const save = () => localStorage.setItem(KEY, JSON.stringify(items));

  function populateMaterialFamilySelect(selected = '') {
    const select = $('materialCategory');
    if (!select) return;
    select.replaceChildren(new Option('Seleccionar material...', '', true, !selected));
    CATALOG.forEach(material => select.add(new Option(material.label, material.id)));
    if (selected) select.value = selected;
  }

  function populateVariantSelect(selected = '') {
    const material = findMaterial($('materialCategory')?.value || '');
    const label = $('materialVariant')?.closest('label');
    const select = $('materialVariant');
    if (!select) return;
    if (!material?.variants?.length) {
      select.replaceChildren(new Option('Sin variante', ''));
      select.value = '';
      select.disabled = true;
      label?.classList.add('hidden');
      return;
    }
    select.replaceChildren(new Option('Seleccionar color...', '', true, !selected));
    material.variants.forEach(v => select.add(new Option(v, v)));
    if (selected) select.value = selected;
    select.disabled = false;
    label?.classList.remove('hidden');
  }

  function populateThicknessSelect(selected = '') {
    const material = findMaterial($('materialCategory')?.value || '');
    const select = $('materialThickness');
    const helper = $('thicknessHelper');
    if (!select) return;
    select.replaceChildren();
    if (!material) {
      select.add(new Option('Seleccioná un material primero', '', true, true));
      select.disabled = true;
      if (helper) helper.textContent = 'Los grosores se filtran según el material elegido.';
      return;
    }
    if (!Array.isArray(material.thicknesses)) {
      select.add(new Option('Grosor pendiente de definir', '', true, true));
      select.disabled = true;
      if (helper) helper.textContent = 'Todavía no se cargaron los grosores disponibles para este material.';
      return;
    }
    select.add(new Option('Seleccionar grosor...', '', true, !selected));
    material.thicknesses.forEach(mm => select.add(new Option(`${mm} mm`, String(mm))));
    if (selected) select.value = String(selected);
    select.disabled = false;
    if (helper) helper.textContent = `Disponibles: ${material.thicknesses.join(', ')} mm.`;
  }

  function renderTable() {
    const body = $('materialsBody');
    const count = $('materialsCount');
    const empty = $('emptyMaterials');
    if (!body || !count || !empty) return;

    body.innerHTML = items.map(m => `
      <tr>
        <td><strong>${esc(findMaterial(m.materialId)?.label || m.name)}</strong></td>
        <td>${m.variant ? esc(m.variant) : '<span class="muted">—</span>'}</td>
        <td>${m.thickness == null ? '<span class="muted">Pendiente</span>' : `${Number(m.thickness)} mm`}</td>
        <td><div class="input-with-unit"><input class="catalog-inline material-price" data-id="${esc(m.id)}" type="number" min="0" step="100" value="${Number(m.price) || 0}" aria-label="Precio por m²"><span>ARS</span></div></td>
        <td><button type="button" class="danger-btn delete-material" data-id="${esc(m.id)}">Eliminar</button></td>
      </tr>`).join('');

    count.textContent = `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`;
    empty.classList.toggle('hidden', items.length > 0);
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('materialsUpdated', { detail: { items } }));
  }

  function init() {
    populateMaterialFamilySelect();
    populateVariantSelect();
    populateThicknessSelect();
    renderTable();

    $('materialCategory')?.addEventListener('change', () => {
      populateVariantSelect();
      populateThicknessSelect();
    });

    $('materialVariant')?.addEventListener('change', () => {
      // El grosor disponible no depende del color en el catálogo actual,
      // pero conservamos esta actualización para futuras reglas por variante.
      populateThicknessSelect($('materialThickness')?.value || '');
    });

    $('materialForm')?.addEventListener('submit', e => {
      e.preventDefault();

      const materialId = $('materialCategory')?.value || '';
      const variant = $('materialVariant')?.disabled ? '' : ($('materialVariant')?.value || '');
      const thicknessRaw = $('materialThickness')?.value || '';
      const thickness = thicknessRaw === '' ? null : Number(thicknessRaw);
      const rawPrice = $('materialPrice')?.value ?? '';
      const price = Number(rawPrice);
      const material = findMaterial(materialId);

      if (!material) {
        alert('Seleccioná un material.');
        return;
      }
      if (material.variants.length && !material.variants.includes(variant)) {
        alert('Seleccioná un color / variante.');
        return;
      }
      if (!Array.isArray(material.thicknesses)) {
        alert('Todavía necesitamos definir los grosores disponibles para este material.');
        return;
      }
      if (!material.thicknesses.includes(thickness)) {
        alert('Seleccioná un grosor disponible para este material.');
        return;
      }
      if (rawPrice === '' || !Number.isFinite(price) || price < 0) {
        alert('Ingresá un precio válido por m².');
        $('materialPrice')?.focus();
        return;
      }

      const name = buildName(materialId, variant);
      const existing = items.find(m => m.materialId === materialId && (m.variant || '') === variant && Number(m.thickness) === thickness);
      if (existing) {
        existing.price = price;
        existing.name = name;
      } else {
        items.push({ id: makeId(), materialId, variant, name, thickness, price });
      }

      items = dedupe(items);
      save();
      renderTable();
      notify();
      $('materialPrice').value = '';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
