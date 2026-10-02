let data = { worlds: [], categories: [], waypoints: [] };
let currentCoords = null;

const $ = (id) => document.getElementById(id);
const api = window.fieldNotes;

function selectedWorld() { return $('wpWorld').value; }
function worldCategories() { return data.categories.filter((category) => category.world_id === selectedWorld()); }

function renderSelectors() {
  const world = selectedWorld();
  $('wpWorld').innerHTML = data.worlds.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  if (world && data.worlds.some((item) => item.id === world)) $('wpWorld').value = world;
  if (!data.worlds.length) $('wpWorld').innerHTML = '<option value="">Create a world in Manage</option>';
  const categories = worldCategories();
  $('wpCategory').innerHTML = categories.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join('');
  if (!categories.length) $('wpCategory').innerHTML = '<option>Other</option>';
  updateConversion();
}

function renderWaypoints() {
  const query = $('searchInput').value.toLowerCase();
  const visible = data.waypoints.filter((item) => {
    const world = data.worlds.find((candidate) => candidate.id === item.world_id);
    return item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query) ||
      (world && world.name.toLowerCase().includes(query)) || item.description.toLowerCase().includes(query);
  });
  $('logList').innerHTML = visible.length ? visible.map((item) => {
    const dimension = item.dimension === 'the_end' ? 'The End' : item.dimension[0].toUpperCase() + item.dimension.slice(1);
    const world = data.worlds.find((candidate) => candidate.id === item.world_id);
    return `<article class="log-item ${item.favorite ? 'favorite-item' : ''}">
      <div class="section-heading"><div class="log-main"><span class="log-name">${escapeHtml(item.name)}</span> <span class="log-description">${escapeHtml(item.category)} · ${escapeHtml(world ? world.name : 'Unknown world')}</span>
      <div class="log-meta">${item.x}, ${item.y}, ${item.z} · ${dimension}</div>${item.description ? `<div class="log-description">${escapeHtml(item.description)}</div>` : ''}</div>
      <div class="item-buttons"><button data-favorite="${item.id}" title="Pin">${item.favorite ? '★' : '☆'}</button><button data-delete="${item.id}" title="Delete">×</button></div></div></article>`;
  }).join('') : '<div class="empty">No waypoints yet. Copy coordinates from Minecraft to begin.</div>';
  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => api.deleteWaypoint(button.dataset.delete)));
  document.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', () => {
    const item = data.waypoints.find((waypoint) => waypoint.id === button.dataset.favorite);
    api.saveWaypoint({ ...item, favorite: !item.favorite });
  }));
}

function renderManage() {
  $('worldList').innerHTML = data.worlds.map((world) => {
    const categories = data.categories.filter((category) => category.world_id === world.id);
    return `<div class="world-entry"><div><strong>${escapeHtml(world.name)}</strong><div class="log-description">${categories.map((category) => `<span>${escapeHtml(category.name)} <button data-category-delete="${category.id}" title="Delete category">×</button></span>`).join(' · ')}</div></div><button data-world-delete="${world.id}">Delete</button></div>`;
  }).join('');
  document.querySelectorAll('[data-world-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (data.worlds.length === 1) return showError('Keep at least one world.');
    data = await api.deleteWorld(button.dataset.worldDelete); renderAll();
  }));
  document.querySelectorAll('[data-category-delete]').forEach((button) => button.addEventListener('click', async () => {
    data = await api.deleteCategory(button.dataset.categoryDelete); renderAll();
  }));
}

function renderAll() { renderSelectors(); renderWaypoints(); renderManage(); }
function updateConversion() {
  if (!currentCoords) { $('conversionDisplay').textContent = 'Portal target: —'; return; }
  const dimension = $('wpDimension').value;
  if (dimension === 'overworld') $('conversionDisplay').textContent = `Nether portal target: X ${Math.round(currentCoords.x / 8)}, Z ${Math.round(currentCoords.z / 8)}`;
  else if (dimension === 'nether') $('conversionDisplay').textContent = `Overworld portal target: X ${Math.round(currentCoords.x * 8)}, Z ${Math.round(currentCoords.z * 8)}`;
  else $('conversionDisplay').textContent = 'The End has no automatic portal conversion.';
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
function showError(message) { $('captureHint').textContent = message; setTimeout(() => { $('captureHint').textContent = 'Copy coordinates in Minecraft'; }, 3000); }

function quickSaveAndReturn() {
  if (!currentCoords || !selectedWorld()) return showError('Copy coordinates and select a world first.');
  api.saveAndClose({ world_id: selectedWorld(), category: $('wpCategory').value, dimension: $('wpDimension').value, ...currentCoords, name: $('wpName').value, description: $('wpDescription').value, favorite: $('wpFavorite').checked });
  $('wpName').value = ''; $('wpDescription').value = ''; $('wpFavorite').checked = false;
}

api.onCoordinates((coordinates) => {
  currentCoords = coordinates;
  $('coordsDisplay').textContent = `X ${coordinates.x}  ·  Y ${coordinates.y}  ·  Z ${coordinates.z}`;
  updateConversion();
});
api.onDataUpdated((updated) => { data = updated; renderAll(); });
api.onSyncStatus((status) => { $('syncStatus').innerHTML = `<i></i> ${status.connected ? 'Connected to LAN peer' : `${status.peers || 0} LAN peer${status.peers === 1 ? '' : 's'}`}`; });
api.onSyncError((message) => showError(`Sync error: ${message}`));
api.onMinecraftStatus((status) => {
  $('minecraftStatus').innerHTML = status.running
    ? '<i></i> Minecraft detected'
    : '<i class="offline"></i> Waiting for Minecraft';
  $('minecraftStatus').classList.toggle('offline', !status.running);
});
// Fired right after Ctrl+Alt+C auto-opens the overlay: jump the caret into the name
// field so the player can type the waypoint name with zero mouse/Alt+Tab involvement.
api.onRequestFocusName(() => { $('wpName').focus(); $('wpName').select(); });

$('saveBtn').addEventListener('click', () => quickSaveAndReturn());
$('wpDimension').addEventListener('change', updateConversion);
$('wpWorld').addEventListener('change', renderSelectors);
$('searchInput').addEventListener('input', renderWaypoints);
$('closeBtn').addEventListener('click', () => api.hide());
$('pinBtn').addEventListener('click', async () => {
  const pinned = !$('pinBtn').classList.contains('active');
  await api.setPinned(pinned);
  $('pinBtn').classList.toggle('active', pinned);
  $('pinBtn').title = pinned ? 'Always on top (click to unpin)' : 'Keep window on top';
});
$('settingsBtn').addEventListener('click', () => $('managePanel').classList.toggle('hidden'));
$('manageClose').addEventListener('click', () => $('managePanel').classList.add('hidden'));
$('addWorld').addEventListener('click', async () => { if (!$('worldName').value.trim()) return; data = await api.saveWorld({ name: $('worldName').value }); $('worldName').value = ''; renderAll(); });
$('addCategory').addEventListener('click', async () => { if (!$('categoryName').value.trim() || !selectedWorld()) return; data = await api.saveCategory({ world_id: selectedWorld(), name: $('categoryName').value }); $('categoryName').value = ''; renderAll(); });

// Keyboard-only quick capture: Enter anywhere in the capture card saves and snaps focus
// back to Minecraft; Escape discards and does the same, so the mouse never needs to leave the game.
document.querySelector('.capture-card').addEventListener('keydown', (event) => {
  if (event.target.tagName === 'TEXTAREA' && event.key === 'Enter' && !event.ctrlKey) return;
  if (event.key === 'Enter') { event.preventDefault(); quickSaveAndReturn(); }
  if (event.key === 'Escape') { event.preventDefault(); api.hide(); }
});

api.getData().then((initialData) => { data = initialData; renderAll(); });
api.getPinned().then((pinned) => {
  $('pinBtn').classList.toggle('active', pinned);
  $('pinBtn').title = pinned ? 'Always on top (click to unpin)' : 'Keep window on top';
});
