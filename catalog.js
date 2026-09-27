(() => {
  'use strict';

  const KEY = 'presupuestador_materiales_v3';
  const THICKNESS = [3, 5, 6, 8, 9, 10, 12, 15, 18, 20, 22, 25, 30, 34];

  const CATALOG = [
    {
      id: 'melamina_aglomerado',
      label: 'Melamina Aglomerado',
      materials: [
        { id: 'blanca', label: 'Melamina Blanca', variants: [] },
        { id: 'color_clasico', label: 'Melamina Color Clásico', variants: ['Negro', 'Cedro'] }
      ]
    },
    {
      id: 'melamina_mdf',
      label: 'Melamina MDF',
      materials: [
        { id: 'blanca', label: 'Melamina Blanca', variants: [] },
        { id: 'color_nature', label: 'Melamina Color Nature', variants: ['Cedro', 'Roble Dakar', 'Roble Americano'] }
      ]
    },
    {
      id: 'otros',
      label: 'Otros materiales',
      materials: [
        { id: 'mdf', label: 'MDF', variants: [] },
        { id: 'fibroplus_blanco', label: 'Fibroplus Blanco', variants: [] },
        { id: 'fibroplus_color', label: 'Fibroplus Color', variants: ['Cedro', 'Negro'] },
        { id: 'pino', label: 'Pino', variants: [] },
        { id: 'eucaliptu', label: 'Eucaliptu', variants: [] },
        { id: 'fenolico', label: 'Fenólico', variants: [] },
        { id: 'terciado_pino', label: 'Terciado Pino', variants: [] },
        { id: 'enchapado_aglomerado', label: 'Enchapado Aglomerado', variants: ['Cedro', 'Cerejeira', 'Paraíso', 'Guatambú'] }
      ]
    }
  ];

  const $ = id => document.getElementById(id);
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = v => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function findDefinition(categoryId, materialId) {
    const category = CATALOG.find(c => c.id === categoryId);
    const material = category?.materials.find(m => m.id === materialId);
    return { category, material };
  }

  function buildName(categoryId, materialId, variant) {
    const { category, material } = findDefinition(categoryId, materialId);
    if (!category || !material) return '';
    const suffix = variant ? ` · ${variant}` : '';
    return `${category.label} · ${material.label}${suffix}`;
  }

  function inferRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const oldName = String(raw.name || '').trim();
    if (!oldName) return null;

    // Prefer already-structured records.
    if (raw.categoryId && raw.materialId) {
      const { category, material } = findDefinition(raw.categoryId, raw.materialId);
      if (category && material) {
        const variant = material.variants.includes(raw.variant) ? raw.variant : '';
        return { ...raw, categoryId: category.id, materialId: material.id, variant, name: buildName(category.id, material.id, variant) };
      }
    }

    // Compatibility with the earlier flat catalog names.
    let categoryId = 'otros';
    let materialId = '';
    let variant = '';

    if (/^Melamina Blanca Aglomerado$/i.test(oldName)) {
      categoryId = 'melamina_aglomerado'; materialId = 'blanca';
    } else if (/^Melamina Blanca MDF$/i.test(oldName)) {
      categoryId = 'melamina_mdf'; materialId = 'blanca';
    } else if (/^Melamina Color Clásico Aglomerado \((.+)\)$/i.test(oldName)) {
      categoryId = 'melamina_aglomerado'; materialId = 'color_clasico';
      variant = oldName.match(/\((.+)\)/i)?.[1]?.split('/')?.[0] || '';
      if (!['Negro', 'Cedro'].includes(variant) && oldName.includes('Cedro')) variant = 'Cedro';
    } else if (/^Melamina Color Nature MDF \((.+)\)$/i.test(oldName)) {
      categoryId = 'melamina_mdf'; materialId = 'color_nature';
      variant = oldName.match(/\((.+)\)/i)?.[1]?.split('/')?.[0] || '';
      if (!['Cedro', 'Roble Dakar', 'Roble Americano'].includes(variant)) variant = '';
    } else if (/^Fibroplus Color \((.+)\)$/i.test(oldName)) {
      materialId = 'fibroplus_color';
      variant = oldName.match(/\((.+)\)/i)?.[1]?.split('/')?.[0] || '';
      if (!['Cedro', 'Negro'].includes(variant)) variant = '';
    } else if (/^Enchapado Aglomerado \((.+)\)$/i.test(oldName)) {
      materialId = 'enchapado_aglomerado';
      variant = oldName.match(/\((.+)\)/i)?.[1]?.split('/')?.[0] || '';
      if (!['Cedro', 'Cerejeira', 'Paraíso', 'Guatambú'].includes(variant)) variant = '';
    } else {
      const map = {
        'MDF': 'mdf',
        'Fibroplus Blanco': 'fibroplus_blanco',
        'Pino': 'pino',
        'Eucaliptu': 'eucaliptu',
        'Fenólico': 'fenolico',
        'Terciado Pino': 'terciado_pino'
      };
      materialId = map[oldName] || '';
    }

    if (!materialId) return { ...raw };
    const { category, material } = findDefinition(categoryId, materialId);
    if (!category || !material) return { ...raw };
    if (material.variants.length && !material.variants.includes(variant)) variant = '';
    return { ...raw, categoryId, materialId, variant, name: buildName(categoryId, materialId, variant) };
  }

  function safeLoad() {
    try {
      const current = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(current) && current.length) return current.map(inferRecord).filter(Boolean);
      const old = JSON.parse(localStorage.getItem('presupuestador_materiales_v2'));
      if (Array.isArray(old) && old.length) return old.map(inferRecord).filter(Boolean);
      const old1 = JSON.parse(localStorage.getItem('presupuestador_materiales_v1'));
      if (Array.isArray(old1) && old1.length) return old1.map(inferRecord).filter(Boolean);
    } catch (_) {}
    return [{ id: makeId(), categoryId: 'otros', materialId: 'mdf', variant: '', name: buildName('otros', 'mdf', ''), thickness: 15, price: 48000 }];
  }

  let items = safeLoad();
  localStorage.setItem(KEY, JSON.stringify(items));
  const save = () => localStorage.setItem(KEY, JSON.stringify(items));

  function populateCategorySelect() {
    const category = $('materialCategory');
    if (!category) return;
    category.replaceChildren(new Option('Seleccionar categoría...', '', true, true));
    CATALOG.forEach(c => category.add(new Option(c.label, c.id)));
  }

  function populateMaterialSelect() {
    const categoryId = $('materialCategory')?.value || '';
    const material = $('materialName');
    const variant = $('materialVariant');
    if (!material) return;
    material.replaceChildren(new Option(categoryId ? 'Seleccionar material...' : 'Seleccioná una categoría primero', '', true, true));
    const category = CATALOG.find(c => c.id === categoryId);
    (category?.materials || []).forEach(m => material.add(new Option(m.label, m.id)));
    if (variant) {
      variant.replaceChildren(new Option('Sin variante', ''));
      variant.disabled = true;
      variant.closest('label')?.classList.add('hidden');
    }
  }

  function populateVariantSelect() {
    const categoryId = $('materialCategory')?.value || '';
    const materialId = $('materialName')?.value || '';
    const variant = $('materialVariant');
    if (!variant) return;
    const { material } = findDefinition(categoryId, materialId);
    variant.replaceChildren(new Option(material?.variants.length ? 'Seleccionar variante...' : 'Sin variante', ''));
    (material?.variants || []).forEach(v => variant.add(new Option(v, v)));
    variant.disabled = !(material?.variants?.length);
    variant.closest('label')?.classList.toggle('hidden', !(material?.variants?.length));
  }

  function populateThicknessSelect() {
    const thickness = $('materialThickness');
    if (!thickness) return;
    thickness.replaceChildren(new Option('Seleccionar grosor...', '', true, true));
    THICKNESS.forEach(mm => thickness.add(new Option(`${mm} mm`, String(mm))));
  }

  function renderTable() {
    const body = $('materialsBody');
    const count = $('materialsCount');
    const empty = $('emptyMaterials');
    if (!body || !count || !empty) return;
    body.innerHTML = items.map(m => `
      <tr>
        <td><strong>${esc(m.categoryId === 'otros' ? 'Otros materiales' : (CATALOG.find(c => c.id === m.categoryId)?.label || ''))}</strong><br><span class="muted">${esc(m.name)}</span></td>
        <td>${Number(m.thickness)} mm</td>
        <td><div class="input-with-unit"><input class="catalog-inline material-price" data-id="${esc(m.id)}" type="number" min="0" step="100" value="${Number(m.price)||0}" aria-label="Precio por m²"><span>ARS</span></div></td>
        <td><button type="button" class="danger-btn delete-material" data-id="${esc(m.id)}">Eliminar</button></td>
      </tr>`).join('');
    count.textContent = `${items.length} ${items.length === 1 ? 'material' : 'materiales'}`;
    empty.classList.toggle('hidden', items.length > 0);
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('materialsUpdated', { detail: { items } }));
  }

  function init() {
    populateCategorySelect();
    populateMaterialSelect();
    populateVariantSelect();
    populateThicknessSelect();
    renderTable();

    $('materialCategory')?.addEventListener('change', () => {
      populateMaterialSelect();
      populateVariantSelect();
    });

    $('materialName')?.addEventListener('change', populateVariantSelect);

    $('materialForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const categoryId = $('materialCategory')?.value || '';
      const materialId = $('materialName')?.value || '';
      const variant = $('materialVariant')?.disabled ? '' : ($('materialVariant')?.value || '');
      const thickness = Number($('materialThickness')?.value || 0);
      const rawPrice = $('materialPrice')?.value ?? '';
      const price = Number(rawPrice);
      const { category, material } = findDefinition(categoryId, materialId);

      if (!category || !material || !THICKNESS.includes(thickness)) {
        alert('Seleccioná una categoría, un material y un grosor.');
        return;
      }
      if (material.variants.length && !material.variants.includes(variant)) {
        alert('Seleccioná una variante.');
        return;
      }
      if (rawPrice === '' || !Number.isFinite(price) || price < 0) {
        alert('Ingresá un precio válido por m².');
        $('materialPrice')?.focus();
        return;
      }

      const name = buildName(categoryId, materialId, variant);
      const existing = items.find(m => m.categoryId === categoryId && m.materialId === materialId && (m.variant || '') === variant && Number(m.thickness) === thickness);
      if (existing) existing.price = price;
      else items.push({ id: makeId(), categoryId, materialId, variant, name, thickness, price });

      save();
      renderTable();
      notify();
      $('materialForm')?.reset();
      populateCategorySelect();
      populateMaterialSelect();
      populateVariantSelect();
      populateThicknessSelect();
      if ($('materialPrice')) $('materialPrice').value = '';
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
