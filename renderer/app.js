const api = window.fieldNotes;
const $ = (id) => document.getElementById(id);

let data = { worlds: [], categories: [], waypoints: [] };
let currentWorldId = null;
let currentCoords = null;
let activeTab = 'capture';
const ui = { editingWaypoint: null, dragId: null, editingWorld: null, confirmWorld: null, picker: null, newCategoryIcon: 'bookmark' };
const collapsed = new Set(JSON.parse(localStorage.getItem('collapsedGroups') || '[]'));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const DIMENSION_LABELS = { overworld: 'Overworld', nether: 'Nether', the_end: 'The End' };

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = svg(el.dataset.icon); });
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
const errorMessage = (error) => String(error && error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function run(action) {
  try { return await action(); } catch (error) { toast(errorMessage(error), true); return null; }
}

function applyData(next) {
  data = next;
  if (!data.worlds.some((world) => world.id === currentWorldId)) {
    currentWorldId = data.worlds[0] ? data.worlds[0].id : null;
    if (currentWorldId) api.setSetting('current_world', currentWorldId);
  }
  renderAll();
}

function setCurrentWorld(id) {
  currentWorldId = id;
  ui.picker = null;
  api.setSetting('current_world', id);
  renderAll();
}

const worldCategories = () => data.categories.filter((c) => c.world_id === currentWorldId);
const worldWaypoints = () => data.waypoints.filter((w) => w.world_id === currentWorldId);
const categoryIcon = (name) => (data.categories.find((c) => c.world_id === currentWorldId && c.name === name) || {}).icon || 'bookmark';

/* Tabs */
function showTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === name));
}
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

/* Rendering */
function renderAll() {
  const hasWorld = data.worlds.length > 0;
  $('welcome').classList.toggle('hidden', hasWorld);
  if (!hasWorld) setTimeout(() => $('welcomeName').focus(), 0);
  renderWorldSelect();
  renderCaptureOptions();
  renderJournal();
  renderWorlds();
  $('journalCount').textContent = worldWaypoints().length || '';
}

function renderWorldSelect() {
  $('worldSelect').innerHTML = data.worlds.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  if (currentWorldId) $('worldSelect').value = currentWorldId;
}

function renderCaptureOptions() {
  const previous = $('wpCategory').value;
  const categories = worldCategories();
  $('wpCategory').innerHTML = (categories.length ? categories : [{ name: 'Other' }])
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  if (categories.some((c) => c.name === previous)) $('wpCategory').value = previous;
  updateCategoryPreview();
  updateConversion();
}

function updateCategoryPreview() {
  $('catPreview').innerHTML = svg(categoryIcon($('wpCategory').value), 20);
}

function updateConversion() {
  const el = $('conversionDisplay');
  if (!currentCoords) { el.textContent = 'Portal target: —'; return; }
  const dimension = $('wpDimension').value;
  if (dimension === 'overworld') el.textContent = `Nether portal target: X ${Math.round(currentCoords.x / 8)}, Z ${Math.round(currentCoords.z / 8)}`;
  else if (dimension === 'nether') el.textContent = `Overworld portal target: X ${Math.round(currentCoords.x * 8)}, Z ${Math.round(currentCoords.z * 8)}`;
  else el.textContent = 'The End has no automatic portal conversion.';
}

function renderCoords() {
  $('coordsDisplay').classList.toggle('empty', !currentCoords);
  $('coordsValue').textContent = currentCoords
    ? `X ${currentCoords.x}   Y ${currentCoords.y}   Z ${currentCoords.z}`
    : 'Press Ctrl + Alt + C in Minecraft';
}

function groupWaypoints(items) {
  const groups = [];
  const pinned = items.filter((w) => w.favorite);
  if (pinned.length) groups.push({ key: '__pinned', name: 'Pinned', icon: 'star', items: pinned });
  const rest = items.filter((w) => !w.favorite);
  const known = new Set();
  for (const category of worldCategories()) {
    known.add(category.name);
    const list = rest.filter((w) => w.category === category.name);
    if (list.length) groups.push({ key: category.name, name: category.name, icon: category.icon, items: list });
  }
  const orphans = [...new Set(rest.filter((w) => !known.has(w.category)).map((w) => w.category))];
  for (const name of orphans) groups.push({ key: name, name, icon: 'bookmark', items: rest.filter((w) => w.category === name) });
  return groups;
}

function editCard(w) {
  const categories = worldCategories().map((c) => c.name);
  if (!categories.includes(w.category)) categories.push(w.category);
  const options = categories.map((name) => `<option value="${escapeHtml(name)}" ${name === w.category ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  const dimensions = Object.entries(DIMENSION_LABELS).map(([key, label]) => `<option value="${key}" ${key === w.dimension ? 'selected' : ''}>${label}</option>`).join('');
  return `<article class="card editing" data-edit-card="${w.id}">
    <div class="form">
      <label>Name<input data-field="name" value="${escapeHtml(w.name)}" autocomplete="off"></label>
      <div class="grid two">
        <label>Category<select data-field="category">${options}</select></label>
        <label>Dimension<select data-field="dimension">${dimensions}</select></label>
      </div>
      <div class="grid three">
        <label>X<input data-field="x" type="number" value="${w.x}"></label>
        <label>Y<input data-field="y" type="number" value="${w.y}"></label>
        <label>Z<input data-field="z" type="number" value="${w.z}"></label>
      </div>
      <label>Notes<textarea data-field="description" rows="3" placeholder="Optional notes">${escapeHtml(w.description)}</textarea></label>
      <div class="actions">
        <button class="secondary" data-action="edit-cancel">Cancel</button>
        <button class="primary" data-action="edit-save" data-id="${w.id}">Save changes</button>
      </div>
    </div>
  </article>`;
}

function waypointCard(w) {
  if (ui.editingWaypoint === w.id) return editCard(w);
  const draggable = !$('searchInput').value.trim();
  const portal = w.dimension === 'overworld' && w.nether_x != null
    ? `Nether portal → X ${w.nether_x}, Z ${w.nether_z}`
    : w.dimension === 'nether' ? `Overworld portal → X ${w.x * 8}, Z ${w.z * 8}` : '';
  return `<article class="card ${w.favorite ? 'pinned' : ''}" data-card="${w.id}" ${draggable ? 'draggable="true"' : ''}>
    <div class="card-head">
      ${draggable ? `<span class="grip" title="Drag to reorder or move to another category">${svg('grip', 16)}</span>` : ''}
      <span class="card-name">${escapeHtml(w.name)}</span>
      <span class="card-actions">
        <button class="mini-button ${w.favorite ? 'active' : ''}" data-action="favorite" data-id="${w.id}" title="${w.favorite ? 'Unpin' : 'Pin to top'}">${svg(w.favorite ? 'starFilled' : 'star', 16)}</button>
        <button class="mini-button" data-action="edit" data-id="${w.id}" title="Edit">${svg('edit', 16)}</button>
        <button class="mini-button danger" data-action="delete" data-id="${w.id}" title="Delete">${svg('trash', 16)}</button>
      </span>
    </div>
    <div class="card-coords">
      <span class="coord-stamp">${w.x}, ${w.y}, ${w.z}</span>
      <button class="mini-button" data-action="copy" data-id="${w.id}" title="Copy coordinates">${svg('copy', 16)}</button>
      <span class="badge ${w.dimension}">${DIMENSION_LABELS[w.dimension] || w.dimension}</span>
    </div>
    ${portal ? `<div class="card-portal">${portal}</div>` : ''}
    ${w.description ? `<div class="card-notes">${escapeHtml(w.description)}</div>` : ''}
  </article>`;
}

function renderJournal() {
  const all = worldWaypoints();
  const query = $('searchInput').value.trim().toLowerCase();
  const items = query
    ? all.filter((w) => [w.name, w.category, w.description].some((text) => text.toLowerCase().includes(query)))
    : all;
  if (!all.length) {
    $('journalList').innerHTML = '<div class="empty">This world\'s pages are blank.<br>Copy coordinates in Minecraft with Ctrl + Alt + C to add your first waypoint.</div>';
    return;
  }
  if (!items.length) { $('journalList').innerHTML = '<div class="empty">No waypoints match your search.</div>'; return; }
  $('journalList').innerHTML = groupWaypoints(items).map((group) => {
    const id = `${currentWorldId}:${group.key}`;
    const isCollapsed = !query && collapsed.has(id);
    return `<section class="group ${isCollapsed ? 'collapsed' : ''}" data-group-key="${escapeHtml(group.key)}">
      <button class="group-header" data-action="toggle" data-group="${escapeHtml(id)}">
        <span class="chevron">${svg('chevron', 16)}</span>
        <span class="group-icon">${svg(group.icon, 20)}</span>
        <span class="group-name">${escapeHtml(group.name)}</span>
        <span class="count">${group.items.length}</span>
      </button>
      <div class="group-body">${group.items.map(waypointCard).join('')}</div>
    </section>`;
  }).join('');
}

function iconPicker(selected, target) {
  return `<div class="picker">${Object.keys(CATEGORY_ICONS).map((key) =>
    `<button class="${key === selected ? 'selected' : ''}" data-action="pick-icon" data-target="${target}" data-icon-key="${key}" title="${key}">${svg(key, 20)}</button>`).join('')}</div>`;
}

function renderWorlds() {
  const worldRows = data.worlds.map((world) => {
    const count = data.waypoints.filter((w) => w.world_id === world.id).length;
    const current = world.id === currentWorldId;
    if (ui.editingWorld === world.id) {
      return `<div class="row current"><input data-world-input="${world.id}" value="${escapeHtml(world.name)}">
        <button class="mini-button" data-action="world-rename-save" data-id="${world.id}" title="Save">${svg('check', 16)}</button>
        <button class="mini-button" data-action="world-rename-cancel" title="Cancel">${svg('close', 16)}</button></div>`;
    }
    if (ui.confirmWorld === world.id) {
      return `<div class="row"><span class="row-name">${escapeHtml(world.name)}</span>
        <span class="confirm-text">Delete${count ? ` ${count} waypoint${count === 1 ? '' : 's'}` : ''}?</span>
        <button class="mini-button confirm" data-action="world-delete-yes" data-id="${world.id}" title="Confirm delete">${svg('check', 16)}</button>
        <button class="mini-button" data-action="world-delete-no" title="Cancel">${svg('close', 16)}</button></div>`;
    }
    return `<div class="row ${current ? 'current' : ''}">
      <span class="row-name" data-action="world-select" data-id="${world.id}">${escapeHtml(world.name)}</span>
      <span class="row-meta">${current ? 'current · ' : ''}${count} waypoint${count === 1 ? '' : 's'}</span>
      <button class="mini-button" data-action="world-rename" data-id="${world.id}" title="Rename">${svg('edit', 16)}</button>
      <button class="mini-button danger" data-action="world-delete" data-id="${world.id}" title="Delete">${svg('trash', 16)}</button></div>`;
  }).join('');

  const currentWorld = data.worlds.find((w) => w.id === currentWorldId);
  const categoryRows = worldCategories().map((category) => `
    <div class="row">
      <button class="mini-button icon-pick" data-action="toggle-picker" data-target="${category.id}" title="Change icon">${svg(category.icon, 20)}</button>
      <input data-category-input="${category.id}" value="${escapeHtml(category.name)}">
      <button class="mini-button danger" data-action="category-delete" data-id="${category.id}" title="Delete category">${svg('trash', 16)}</button>
    </div>${ui.picker === category.id ? iconPicker(category.icon, category.id) : ''}`).join('');

  $('worldsPane').innerHTML = `
    <div class="section">
      <h2 class="section-title">Worlds</h2>
      ${worldRows}
      <div class="row add"><input id="newWorldName" placeholder="New world name" autocomplete="off">
        <button class="secondary" data-action="world-add">Add</button></div>
    </div>
    ${currentWorld ? `<div class="section">
      <h2 class="section-title">Categories in ${escapeHtml(currentWorld.name)}</h2>
      ${categoryRows}
      <div class="row add">
        <button class="mini-button icon-pick" data-action="toggle-picker" data-target="new" title="Choose icon">${svg(ui.newCategoryIcon, 20)}</button>
        <input id="newCategoryName" placeholder="New category" autocomplete="off">
        <button class="secondary" data-action="category-add">Add</button>
      </div>
      ${ui.picker === 'new' ? iconPicker(ui.newCategoryIcon, 'new') : ''}
    </div>` : ''}`;
  const editing = document.querySelector('[data-world-input]');
  if (editing) { editing.focus(); editing.select(); }
}

/* Capture */
function quickSaveAndReturn() {
  if (!currentCoords) return toast('Copy coordinates in Minecraft first.', true);
  if (!currentWorldId) return toast('Create a world first.', true);
  api.saveAndClose({
    world_id: currentWorldId,
    category: $('wpCategory').value,
    dimension: $('wpDimension').value,
    ...currentCoords,
    name: $('wpName').value,
    description: $('wpDescription').value,
    favorite: $('wpFavorite').checked
  });
  $('wpName').value = '';
  $('wpDescription').value = '';
  $('wpFavorite').checked = false;
  currentCoords = null;
  renderCoords();
  updateConversion();
  showTab('journal');
}

$('saveBtn').addEventListener('click', quickSaveAndReturn);
$('wpDimension').addEventListener('change', updateConversion);
$('wpCategory').addEventListener('change', updateCategoryPreview);
$('worldSelect').addEventListener('change', (event) => setCurrentWorld(event.target.value));
$('searchInput').addEventListener('input', renderJournal);
$('closeBtn').addEventListener('click', () => api.hide());

// Enter saves and returns to Minecraft; Esc discards. Both keep the mouse out of the loop.
$('pane-capture').addEventListener('keydown', (event) => {
  if (event.target.tagName === 'TEXTAREA' && event.key === 'Enter' && !event.ctrlKey) return;
  if (event.key === 'Enter') { event.preventDefault(); quickSaveAndReturn(); }
  if (event.key === 'Escape') { event.preventDefault(); api.hide(); }
});

/* Journal actions */
$('journalList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, group } = button.dataset;
  if (action === 'toggle') {
    if (collapsed.has(group)) collapsed.delete(group); else collapsed.add(group);
    localStorage.setItem('collapsedGroups', JSON.stringify([...collapsed]));
    renderJournal();
  } else if (action === 'favorite') {
    const item = data.waypoints.find((w) => w.id === id);
    await run(async () => applyData(await api.setFavorite(id, !item.favorite)));
  } else if (action === 'edit') {
    ui.editingWaypoint = id;
    renderJournal();
    document.querySelector('[data-edit-card] [data-field=name]').focus();
  } else if (action === 'edit-cancel') {
    ui.editingWaypoint = null;
    renderJournal();
  } else if (action === 'edit-save') {
    const card = button.closest('[data-edit-card]');
    const field = (name) => card.querySelector('[data-field=' + name + ']').value;
    const original = data.waypoints.find((w) => w.id === id);
    const coords = ['x', 'y', 'z'].map((axis) => Number(field(axis)));
    if (coords.some((value) => !Number.isFinite(value))) return toast('Coordinates must be numbers.', true);
    const updated = { ...original, name: field('name'), category: field('category'), dimension: field('dimension'),
      x: Math.round(coords[0]), y: Math.round(coords[1]), z: Math.round(coords[2]), description: field('description') };
    await api.saveWaypoint(updated);
    ui.editingWaypoint = null;
    toast('Waypoint updated');
  } else if (action === 'copy') {
    const item = data.waypoints.find((w) => w.id === id);
    await api.copyText(`${item.x} ${item.y} ${item.z}`);
    toast('Coordinates copied');
  } else if (action === 'delete') {
    if (button.classList.contains('confirm')) {
      await run(async () => applyData(await api.deleteWaypoint(id)));
    } else {
      button.classList.add('confirm');
      button.title = 'Click again to delete';
      setTimeout(() => button.classList.remove('confirm'), 2500);
    }
  }
});

/* Drag to reorder / move between categories */
function dropTarget(group, event) {
  const source = data.waypoints.find((w) => w.id === ui.dragId);
  if (!source || !group) return null;
  const pinnedGroup = group.dataset.groupKey === '__pinned';
  if (Boolean(source.favorite) !== pinnedGroup) return null;
  const cards = [...group.querySelectorAll('[data-card]')].filter((card) => card.dataset.card !== ui.dragId);
  const before = cards.find((card) => {
    const box = card.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  return { group, pinnedGroup, before: before || null };
}
function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-end, .drop-over').forEach((el) => el.classList.remove('drop-before', 'drop-end', 'drop-over'));
}
$('journalList').addEventListener('dragstart', (event) => {
  const card = event.target.closest('[data-card]');
  if (!card) return;
  ui.dragId = card.dataset.card;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', ui.dragId);
  setTimeout(() => card.classList.add('dragging'), 0);
});
$('journalList').addEventListener('dragover', (event) => {
  const target = dropTarget(event.target.closest('.group'), event);
  if (!target) return;
  event.preventDefault();
  clearDropMarks();
  target.group.classList.add('drop-over');
  (target.before ? target.before : target.group.querySelector('.group-body')).classList.add(target.before ? 'drop-before' : 'drop-end');
});
$('journalList').addEventListener('drop', async (event) => {
  const target = dropTarget(event.target.closest('.group'), event);
  clearDropMarks();
  if (!target) return;
  event.preventDefault();
  const dragId = ui.dragId;
  const destination = target.pinnedGroup ? { pinned: true } : { category: target.group.dataset.groupKey };
  await run(async () => applyData(await api.moveWaypoint(dragId, destination, target.before ? target.before.dataset.card : null)));
});
$('journalList').addEventListener('dragend', () => {
  ui.dragId = null;
  clearDropMarks();
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
});

/* Worlds actions */
$('worldsPane').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id, target, iconKey } = button.dataset;
  const rerender = () => renderWorlds();

  if (action === 'world-select') return setCurrentWorld(id);
  if (action === 'world-rename') { ui.editingWorld = id; return rerender(); }
  if (action === 'world-rename-cancel') { ui.editingWorld = null; return rerender(); }
  if (action === 'world-rename-save') {
    const name = document.querySelector(`[data-world-input="${id}"]`).value;
    const result = await run(() => api.saveWorld({ id, name }));
    if (result) { ui.editingWorld = null; applyData(result); }
  } else if (action === 'world-delete') { ui.confirmWorld = id; rerender();
  } else if (action === 'world-delete-no') { ui.confirmWorld = null; rerender();
  } else if (action === 'world-delete-yes') {
    ui.confirmWorld = null;
    await run(async () => applyData(await api.deleteWorld(id)));
  } else if (action === 'world-add') {
    await addWorld($('newWorldName').value);
  } else if (action === 'toggle-picker') {
    ui.picker = ui.picker === target ? null : target; rerender();
  } else if (action === 'pick-icon') {
    ui.picker = null;
    if (target === 'new') { ui.newCategoryIcon = iconKey; return rerender(); }
    const category = data.categories.find((c) => c.id === target);
    await run(async () => applyData(await api.saveCategory({ ...category, icon: iconKey })));
  } else if (action === 'category-add') {
    const name = $('newCategoryName').value;
    const result = await run(() => api.saveCategory({ world_id: currentWorldId, name, icon: ui.newCategoryIcon }));
    if (result) { ui.newCategoryIcon = 'bookmark'; applyData(result); }
  } else if (action === 'category-delete') {
    await run(async () => applyData(await api.deleteCategory(id)));
  }
});

$('worldsPane').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== 'Escape') return;
  if (event.target.id === 'newWorldName' && event.key === 'Enter') addWorld(event.target.value);
  else if (event.target.id === 'newCategoryName' && event.key === 'Enter') document.querySelector('[data-action="category-add"]').click();
  else if (event.target.dataset.worldInput) {
    if (event.key === 'Enter') document.querySelector('[data-action="world-rename-save"]').click();
    else { ui.editingWorld = null; renderWorlds(); }
  } else if (event.target.dataset.categoryInput && event.key === 'Enter') event.target.blur();
});

$('worldsPane').addEventListener('change', async (event) => {
  const id = event.target.dataset.categoryInput;
  if (!id) return;
  const category = data.categories.find((c) => c.id === id);
  const result = await run(() => api.saveCategory({ ...category, name: event.target.value }));
  if (result) applyData(result); else renderWorlds();
});

async function addWorld(name) {
  const result = await run(() => api.saveWorld({ name }));
  if (!result) return false;
  currentWorldId = result.savedId;
  api.setSetting('current_world', currentWorldId);
  applyData(result);
  return true;
}

/* Welcome */
async function createFirstWorld() {
  $('welcomeError').textContent = '';
  try {
    const result = await api.saveWorld({ name: $('welcomeName').value });
    currentWorldId = result.savedId;
    api.setSetting('current_world', currentWorldId);
    applyData(result);
    showTab('capture');
  } catch (error) {
    $('welcomeError').textContent = errorMessage(error);
  }
}
$('welcomeCreate').addEventListener('click', createFirstWorld);
$('welcomeName').addEventListener('keydown', (event) => { if (event.key === 'Enter') createFirstWorld(); });

/* Main-process events */
api.onCoordinates((coordinates) => {
  currentCoords = coordinates;
  renderCoords();
  updateConversion();
  showTab('capture');
});
// Fired right after Ctrl+Alt+C auto-opens the overlay so the name can be typed without the mouse.
api.onRequestFocusName(() => { showTab('capture'); $('wpName').focus(); $('wpName').select(); });
api.onDataUpdated(applyData);
api.onSyncStatus((status) => {
  $('syncStatus').lastElementChild.textContent = status.connected
    ? 'Connected to LAN peer'
    : `${status.peers || 0} LAN peer${status.peers === 1 ? '' : 's'}`;
});
api.onSyncError((message) => toast(`Sync error: ${message}`, true));
api.onMinecraftStatus((status) => {
  $('minecraftStatus').lastElementChild.textContent = status.running ? 'Minecraft detected' : 'Waiting for Minecraft';
  $('minecraftStatus').classList.toggle('offline', !status.running);
});

$('pinBtn').addEventListener('click', async () => {
  const pinned = !$('pinBtn').classList.contains('active');
  await api.setPinned(pinned);
  setPinnedUi(pinned);
});
function setPinnedUi(pinned) {
  $('pinBtn').classList.toggle('active', pinned);
  $('pinBtn').title = pinned ? 'Always on top (click to unpin)' : 'Keep window on top';
}

/* Startup */
hydrateIcons();
renderCoords();
Promise.all([api.getData(), api.getSetting('current_world'), api.getPinned()]).then(([initial, savedWorld, pinned]) => {
  currentWorldId = savedWorld;
  setPinnedUi(pinned);
  applyData(initial);
  if (data.waypoints.length) showTab('journal');
});
