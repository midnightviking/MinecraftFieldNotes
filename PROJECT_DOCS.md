# Minecraft Field Notes — Project Summary & Architecture Guide

## 1. Executive Summary & Core Objective

**Minecraft Field Notes** is an Electron-based desktop companion and overlay application designed specifically for **Minecraft Bedrock Edition**. It allows players to capture, calculate, categorize, store, and sync coordinates across local network players—**100% compliant with Xbox Achievements**.

### The Problem
Custom Bedrock Add-ons using the `@minecraft/server` Script API permanently flag worlds as **"Achievements Disabled"**. 

### The Solution
This application operates strictly outside the Minecraft game process. Using Minecraft Bedrock's native **"Copy Coordinate UI"** feature (`CTRL + ALT + C`), the overlay listens to the Windows clipboard, parses coordinate strings on the fly, auto-calculates Nether/Overworld portal equivalents, and saves the data into a local SQLite database.

### Key Features
* **100% Achievement Safe:** No mods, behavior packs, or game memory reading required.
* **Seamless In-Game Workflow:** Press `CTRL + ALT + C` in Minecraft to bring up the logbook overlay automatically.
* **Persistent & Reliable Storage:** Uses **SQLite** with Write-Ahead Logging (WAL) for durability and easy backup.
* **Live Local Network Sync:** Built-in WebSocket server/client engine syncs waypoints across devices on the same Wi-Fi network (e.g., between family members playing on separate PCs).
* **Dimensional Intelligence:** Automatically converts and displays Nether $\leftrightarrow$ Overworld portal target coordinates ($8:1$ ratio).
* Add and remove worlds and categories. E.g. 'Pirate world' to store that set of coordinates. It will have categories such as "Villages, Nether Portals, Farms, Base, POI, Ancient Cities". Basic CRUD capabilities to interact with the categories. 
* Small descriptions associated with each coordinate. 
* Future UI improvements will include assigning an icon to the category. Pin or favorite a destination. 
---

## 2. Key Architectural Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MINECRAFT BEDROCK EDITION                          │
│                   Settings -> Creator -> Copy Coordinate UI                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Clipboard (CTRL+ALT+C)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ELECTRON MAIN PROCESS (main.js)                      │
│                                                                             │
│  ┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Clipboard Poll Engine │  │ SQLite Database Engine│  │ WebSocket Server │  │
│  │ (Regex Pattern Match) │  │ (better-sqlite3 / WAL│  │ & Client Sync    │  │
│  └───────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└──────────────┼─────────────────────────┼───────────────────────┼────────────┘
               │ IPC                     │ IPC                   │ WS Sync
               ▼                         ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RENDERER PROCESS (index.html / app.js)                │
│  • Floating Dark UI Overlay                                                 │
│  • Dynamic Nether / Overworld Portal Target Calculator                      │
│  • SQLite-Driven Waypoint List & Category Filtering                         │
│  • Real-time LAN Peer Sync Status Indicator                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Electron Main Process (`main.js`)**:
   - Manages global keyboard shortcuts (`Alt+L`) and clipboard polling intervals.
   - Hosts a local **SQLite** database using `better-sqlite3` in WAL mode.
   - Hosts a **WebSocket server** (and optional client node) to broadcast newly logged waypoints to LAN peers.

2. **Electron Renderer Process (`renderer/index.html` & `renderer/app.js`)**:
   - Provides a frameless, transparent, always-on-top overlay.
   - Handles player inputs (Waypoint Name, Category, Dimension).
   - Dynamically calculates Overworld to Nether coordinates ($X / 8, Z / 8$) and Nether to Overworld coordinates ($X \times 8, Z \times 8$).

---

## 3. Data Model & Schema

The application uses an embedded **SQLite** database stored locally in `waypoints.db`.

### `waypoints` Table Schema

| Field | Column Name | SQLite Data Type | Description |
| :--- | :--- | :--- | :--- |
| **Primary Key** | `id` | `TEXT` | UUID v4 generated on item creation |
| **Name** | `name` | `TEXT` | User-provided label (e.g., "Home Bed", "Skeleton Spawner") |
| **Category** | `category` | `TEXT` | Category filter ("Home", "Trader Hall", "Portal", "Base", "Other") |
| **Dimension** | `dimension` | `TEXT` | Dimension identifier ("overworld", "nether", "the_end") |
| **X Pos** | `x` | `INTEGER` | Saved X Coordinate |
| **Y Pos** | `y` | `INTEGER` | Saved Y Coordinate (Height) |
| **Z Pos** | `z` | `INTEGER` | Saved Z Coordinate |
| **Nether X** | `nether_x` | `INTEGER` | Calculated Nether X target (if saved in Overworld) |
| **Nether Z** | `nether_z` | `INTEGER` | Calculated Nether Z target (if saved in Overworld) |
| **Timestamp** | `created_at` | `INTEGER` | Unix epoch time in milliseconds |
| **Origin** | `source_device` | `TEXT` | Hostname/Device ID of creator (used for WS sync deduplication) |

---

## 4. Project File Structure & Code Implementations

### Folder Structure
```text
MinecraftFieldNotes/
├── package.json
├── main.js
├── waypoints.db (Auto-created at runtime)
├── PROJECT_DOCS.md
└── renderer/
    ├── index.html
    └── app.js
```

### Complete Code Files

```json:package.json:package.json
{
	"name": "minecraft-field-notes",
	"productName": "Minecraft Field Notes",
	"version": "1.0.0",
	"description": "An achievement-friendly overlay, coordinate logger, and LAN waypoint-sharing companion for Minecraft Bedrock Edition.",
	"main": "main.js",
	"scripts": {
		"start": "electron ."
	},
	"devDependencies": {
		"electron": "^28.2.0"
	},
	"dependencies": {
		"better-sqlite3": "^9.4.3",
		"ws": "^8.16.0"
	}
}