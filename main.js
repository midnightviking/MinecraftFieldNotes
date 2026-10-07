const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const Database = require('better-sqlite3');
const WebSocket = require('ws');

const SYNC_PORT = 17321;
const COORDINATE_PATTERN = /(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/;
const MINECRAFT_PROCESS_NAME = 'Minecraft.Windows.exe';
const MINECRAFT_POLL_MS = 2000;
const DEFAULT_CATEGORIES = [
  ['Home', 'home'], ['Villages', 'village'], ['Nether Portals', 'portal'], ['Farms', 'farm'],
  ['Base', 'castle'], ['POI', 'pin'], ['Ancient Cities', 'ruins'], ['Other', 'bookmark']
];
let mainWindow;
let database;
let syncServer;
let lastClipboardText = '';
const peers = new Set();
const syncClients = new Set();
let minecraftRunning = false;
let hotkeyRegistered = false;
let tray = null;
let isQuitting = false;

function createDatabase() {
  database = new Database(path.join(app.getPath('userData'), 'waypoints.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(world_id, name)
    );
    CREATE TABLE IF NOT EXISTS waypoints (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      dimension TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      z INTEGER NOT NULL,
      nether_x INTEGER,
      nether_z INTEGER,
      description TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      source_device TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_waypoints_world ON waypoints(world_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const columns = database.prepare('PRAGMA table_info(categories)').all();
  if (!columns.some((column) => column.name === 'icon')) {
    database.exec("ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'bookmark'");
    const setIcon = database.prepare('UPDATE categories SET icon = ? WHERE name = ?');
    DEFAULT_CATEGORIES.forEach(([name, icon]) => setIcon.run(icon, name));
  }
}

function seedDefaultCategories(worldId) {
  const insert = database.prepare(
    'INSERT OR IGNORE INTO categories (id, world_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = Date.now();
  DEFAULT_CATEGORIES.forEach(([name, icon]) => insert.run(crypto.randomUUID(), worldId, name, icon, now));
}

function normalizeWaypoint(input) {
  const overworld = input.dimension === 'overworld';
  return {
    id: input.id || crypto.randomUUID(),
    world_id: input.world_id,
    name: String(input.name || 'Unnamed Waypoint').trim() || 'Unnamed Waypoint',
    category: String(input.category || 'Other'),
    dimension: input.dimension,
    x: Number(input.x),
    y: Number(input.y),
    z: Number(input.z),
    nether_x: overworld ? Math.round(input.x / 8) : null,
    nether_z: overworld ? Math.round(input.z / 8) : null,
    description: String(input.description || '').trim(),
    favorite: input.favorite ? 1 : 0,
    created_at: input.created_at || Date.now(),
    source_device: input.source_device || os.hostname()
  };
}

function listData() {
  const worlds = database.prepare('SELECT * FROM worlds ORDER BY name COLLATE NOCASE').all();
  const categories = database.prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE').all();
  const waypoints = database.prepare('SELECT * FROM waypoints ORDER BY favorite DESC, created_at DESC').all();
  return { worlds, categories, waypoints };
}

function getSetting(key, fallback) {
  const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  database.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function isPinned() {
  return getSetting('pinned', '0') === '1';
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function broadcast(message, except) {
  const serialized = JSON.stringify(message);
  for (const socket of [...peers, ...syncClients]) {
    if (socket !== except && socket.readyState === WebSocket.OPEN) socket.send(serialized);
  }
}

function mergeSnapshot(snapshot) {
  const worldIds = new Map();
  for (const world of snapshot.worlds || []) {
    const existing = database.prepare('SELECT id FROM worlds WHERE name = ?').get(world.name);
    const id = existing ? existing.id : world.id;
    database.prepare(`
      INSERT INTO worlds (id, name, created_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name
    `).run(id, world.name, world.created_at);
    worldIds.set(world.id, id);
  }
  for (const category of snapshot.categories || []) {
    const worldId = worldIds.get(category.world_id) || category.world_id;
    const existing = database.prepare('SELECT id FROM categories WHERE world_id = ? AND name = ?').get(worldId, category.name);
    const id = existing ? existing.id : category.id;
    database.prepare(`
      INSERT INTO categories (id, world_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, world_id=excluded.world_id, icon=excluded.icon
    `).run(id, worldId, category.name, category.icon || 'bookmark', category.created_at);
  }
  for (const waypoint of snapshot.waypoints || []) {
    const worldId = worldIds.get(waypoint.world_id) || waypoint.world_id;
    if (!database.prepare('SELECT 1 FROM worlds WHERE id = ?').get(worldId)) continue;
    upsertWaypoint({ ...waypoint, world_id: worldId }, false);
  }
}

function upsertWaypoint(waypoint, shouldBroadcast = true) {
  database.prepare(`
    INSERT INTO waypoints (
      id, world_id, name, category, dimension, x, y, z, nether_x, nether_z,
      description, favorite, created_at, source_device
    ) VALUES (@id, @world_id, @name, @category, @dimension, @x, @y, @z, @nether_x, @nether_z,
      @description, @favorite, @created_at, @source_device)
    ON CONFLICT(id) DO UPDATE SET
      world_id=excluded.world_id, name=excluded.name, category=excluded.category,
      dimension=excluded.dimension, x=excluded.x, y=excluded.y, z=excluded.z,
      nether_x=excluded.nether_x, nether_z=excluded.nether_z,
      description=excluded.description, favorite=excluded.favorite,
      created_at=excluded.created_at, source_device=excluded.source_device
  `).run(waypoint);
  if (shouldBroadcast) broadcast({ type: 'waypoint-upsert', waypoint });
}

const APP_ICON_PATH = path.join(__dirname, 'build', 'icon.ico');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 460,
    minHeight: 620,
    alwaysOnTop: false,
    frame: false,
    transparent: true,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', (event) => {
    // Clicking the window's own close button just tucks it into the tray instead of quitting the app,
    // since the app is meant to keep quietly watching for Minecraft in the background.
    if (!isQuitting) {
      event.preventDefault();
      hideOverlayAndReturnToGame();
    }
  });
  mainWindow.setAlwaysOnTop(isPinned());
}

function createTray() {
  try {
    tray = new Tray(APP_ICON_PATH);
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    return;
  }
  tray.setToolTip('Minecraft Field Notes');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Field Notes', click: () => showAndFocusOverlay() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) hideOverlayAndReturnToGame();
    else showAndFocusOverlay();
  });
}

function parseCoordinates(text) {
  const match = text.match(COORDINATE_PATTERN);
  if (!match) return null;
  return {
    x: Math.round(Number(match[1])),
    y: Math.round(Number(match[2])),
    z: Math.round(Number(match[3]))
  };
}

function startClipboardPoll() {
  setInterval(() => {
    if (!minecraftRunning) return;
    const text = clipboard.readText().trim();
    if (!text || text === lastClipboardText) return;
    lastClipboardText = text;
    const coordinates = parseCoordinates(text);
    if (!coordinates) return;
    send('clipboard-coordinates', coordinates);
    showAndFocusOverlay();
  }, 500);
}

function showAndFocusOverlay() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  send('request-focus-name');
}

function refocusMinecraft() {
  // Hand keyboard focus back to Minecraft automatically so the player never has to Alt+Tab manually.
  execFile('powershell', [
    '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    "(New-Object -ComObject WScript.Shell).AppActivate('Minecraft') | Out-Null"
  ], () => {});
}

function hideOverlayAndReturnToGame() {
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
  if (minecraftRunning) refocusMinecraft();
}

function isMinecraftRunning(callback) {
  // tasklist is faster and more reliable than spinning up PowerShell/WMI for a 2s poll.
  execFile('tasklist', ['/FI', `IMAGENAME eq ${MINECRAFT_PROCESS_NAME}`, '/NH'], (error, stdout) => {
    if (error) { callback(false); return; }
    callback(stdout.toLowerCase().includes(MINECRAFT_PROCESS_NAME.toLowerCase()));
  });
}

function registerHotkey() {
  if (hotkeyRegistered) return;
  hotkeyRegistered = globalShortcut.register('Alt+L', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) hideOverlayAndReturnToGame();
    else showAndFocusOverlay();
  });
}

function unregisterHotkey() {
  if (!hotkeyRegistered) return;
  globalShortcut.unregister('Alt+L');
  hotkeyRegistered = false;
}

function startMinecraftWatcher() {
  const evaluate = () => {
    isMinecraftRunning((running) => {
      if (running === minecraftRunning) return;
      minecraftRunning = running;
      send('minecraft-status', { running });
      if (running) {
        // Minecraft just launched: arm the hotkey for this session so it doesn't steal Alt+L elsewhere.
        registerHotkey();
      } else {
        // Minecraft closed: release the hotkey, stop treating clipboard copies as coordinate captures, and tuck the overlay away.
        unregisterHotkey();
        lastClipboardText = '';
        if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
      }
    });
  };
  evaluate();
  setInterval(evaluate, MINECRAFT_POLL_MS);
}

function startSyncServer() {
  syncServer = new WebSocket.Server({ port: SYNC_PORT });
  syncServer.on('connection', (socket) => {
    peers.add(socket);
    socket.send(JSON.stringify({ type: 'snapshot', data: listData(), device: os.hostname() }));
    send('sync-status', { peers: peers.size, port: SYNC_PORT });
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === 'waypoint-upsert' && message.waypoint) {
        upsertWaypoint(message.waypoint, false);
        send('data-updated', listData());
        broadcast(message, socket);
      } else if (message.type === 'waypoint-delete' && message.id) {
        database.prepare('DELETE FROM waypoints WHERE id = ?').run(message.id);
        send('data-updated', listData());
        broadcast(message, socket);
      }
    });
    socket.on('close', () => {
      peers.delete(socket);
      send('sync-status', { peers: peers.size, port: SYNC_PORT });
    });
  });
  syncServer.on('error', (error) => send('sync-error', error.message));
}

function registerIpc() {
  ipcMain.handle('data:list', () => listData());
  ipcMain.handle('waypoint:save', (_event, input) => {
    const waypoint = normalizeWaypoint(input);
    upsertWaypoint(waypoint);
    send('data-updated', listData());
    return waypoint;
  });
  ipcMain.on('waypoint:save-and-close', (_event, input) => {
    upsertWaypoint(normalizeWaypoint(input));
    send('data-updated', listData());
    hideOverlayAndReturnToGame();
  });
  ipcMain.handle('waypoint:delete', (_event, id) => {
    database.prepare('DELETE FROM waypoints WHERE id = ?').run(id);
    broadcast({ type: 'waypoint-delete', id });
    return listData();
  });
  ipcMain.handle('waypoint:set-favorite', (_event, id, favorite) => {
    database.prepare('UPDATE waypoints SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
    const waypoint = database.prepare('SELECT * FROM waypoints WHERE id = ?').get(id);
    if (waypoint) broadcast({ type: 'waypoint-upsert', waypoint });
    return listData();
  });
  ipcMain.handle('world:save', (_event, input) => {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('World name is required.');
    const id = input.id || crypto.randomUUID();
    const duplicate = database.prepare('SELECT id FROM worlds WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
    if (duplicate) throw new Error('A world with that name already exists.');
    const isNew = !database.prepare('SELECT 1 FROM worlds WHERE id = ?').get(id);
    database.prepare(`
      INSERT INTO worlds (id, name, created_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name
    `).run(id, name, Date.now());
    if (isNew) seedDefaultCategories(id);
    return { ...listData(), savedId: id };
  });
  ipcMain.handle('world:delete', (_event, id) => {
    database.prepare('DELETE FROM worlds WHERE id = ?').run(id);
    return listData();
  });
  ipcMain.handle('category:save', (_event, input) => {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Category name is required.');
    const icon = String(input.icon || 'bookmark');
    const previous = input.id ? database.prepare('SELECT * FROM categories WHERE id = ?').get(input.id) : null;
    const duplicate = database.prepare(
      'SELECT id FROM categories WHERE world_id = ? AND name = ? COLLATE NOCASE AND id != ?'
    ).get(input.world_id, name, input.id || '');
    if (duplicate) throw new Error('That category already exists in this world.');
    database.transaction(() => {
      if (previous) {
        database.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, previous.id);
        if (previous.name !== name) {
          database.prepare('UPDATE waypoints SET category = ? WHERE world_id = ? AND category = ?')
            .run(name, previous.world_id, previous.name);
        }
      } else {
        database.prepare('INSERT INTO categories (id, world_id, name, icon, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(crypto.randomUUID(), input.world_id, name, icon, Date.now());
      }
    })();
    return listData();
  });
  ipcMain.handle('category:delete', (_event, id) => {
    const category = database.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (category) {
      database.prepare("UPDATE waypoints SET category = 'Other' WHERE world_id = ? AND category = ?")
        .run(category.world_id, category.name);
      database.prepare('DELETE FROM categories WHERE id = ?').run(id);
    }
    return listData();
  });
  ipcMain.handle('settings:get', (_event, key) => getSetting(key, null));
  ipcMain.handle('settings:set', (_event, key, value) => { setSetting(String(key), String(value)); return true; });
  ipcMain.handle('clipboard:write', (_event, text) => {
    lastClipboardText = String(text);
    clipboard.writeText(lastClipboardText);
    return true;
  });  ipcMain.handle('sync:connect', (_event, address) => {
    const socket = new WebSocket(address);
    syncClients.add(socket);
    socket.on('open', () => send('sync-status', { connected: true, address }));
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === 'snapshot' && message.data) {
        mergeSnapshot(message.data);
        send('data-updated', listData());
      } else if (message.type === 'waypoint-upsert' && message.waypoint) {
        upsertWaypoint(message.waypoint, false);
        send('data-updated', listData());
      } else if (message.type === 'waypoint-delete' && message.id) {
        database.prepare('DELETE FROM waypoints WHERE id = ?').run(message.id);
        send('data-updated', listData());
      }
    });
    socket.on('error', (error) => send('sync-error', error.message));
    socket.on('close', () => { syncClients.delete(socket); send('sync-status', { connected: false }); });
    return true;
  });
  ipcMain.on('window:hide', () => hideOverlayAndReturnToGame());
  ipcMain.on('window:toggle', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) hideOverlayAndReturnToGame(); else showAndFocusOverlay();
  });
  ipcMain.handle('window:get-pinned', () => isPinned());
  ipcMain.handle('window:set-pinned', (_event, pinned) => {
    setSetting('pinned', pinned ? '1' : '0');
    if (mainWindow) mainWindow.setAlwaysOnTop(pinned);
    return pinned;
  });
}

app.whenReady().then(() => {
  createDatabase();
  registerIpc();
  createWindow();
  createTray();
  startClipboardPoll();
  startSyncServer();
  startMinecraftWatcher();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('will-quit', () => {
  unregisterHotkey();
  if (syncServer) syncServer.close();
  if (database) database.close();
});
