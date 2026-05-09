# D&D Campaign Tracker — Project Guide for Claude

## What this is

A static web app for tracking a D&D 5e campaign — character Dionys (Bacchus Valtorian), Human Warlock. All data lives as JSON files in the repo. GitHub Pages serves the public-facing pages; the GitHub API (via PAT) powers the admin panel. No build step, no framework.

---

## Architecture

```
GitHub Repo (denyuneedtoknow/dnd_ai_warlock_adventure)
    ├── Public pages  — static HTML/CSS/JS, fetch JSON files directly
    └── Admin panel   — reads/writes JSON via GitHub API (requires PAT)
```

- **No build step** — edit files and push; GitHub Pages serves instantly.
- **Auth** — GitHub Fine-grained PAT stored in `localStorage` under key `dnd_gh_token`. Never sent anywhere except GitHub API.
- **Data persistence** — all state is in `data/*.json` files committed to the repo.

---

## File structure

```
├── index.html          # Landing: hero section, status bar, last journal entry
├── character.html      # Full character sheet (stats, saves, skills, features)
├── inventory.html      # Equipment paperdoll + 48-slot backpack + wallet
├── spells.html         # Spell list, pact magic, cantrips, invocations
├── npcs.html           # NPC directory with relation filter
├── journal.html        # Session diary, reverse chronological
├── admin.html          # Admin panel (GitHub PAT required)
├── css/
│   └── style.css       # Dark fantasy theme — CSS variables, responsive grids
├── js/
│   ├── main.js         # Shared: renderNav(), loadJSON(), tooltips, notify()
│   └── admin.js        # Admin: GitHub API, all CRUD operations
└── data/
    ├── character.json
    ├── inventory.json
    ├── journal.json
    ├── journal_backup.json   # Auto-created before every journal write
    ├── npcs.json
    └── spells.json
```

---

## Data formats

### journal.json — Session diary

Array sorted **newest-first** (day N at index 0).

```json
[
  {
    "day": 43,
    "date_real": "2026-04-23",
    "location": "Кам'янка → Лейлон",
    "summary": "Narrative of the session...",
    "next_steps": "Optional: upcoming goals"
  }
]
```

**Adding new entries — incremental import (no full replace needed):**

In the Admin panel → Journal tab → "Імпорт записів":
- Paste a JSON array with only the **new** entries, e.g. `[{"day": 44, ...}, {"day": 45, ...}]`
- The import function checks each entry's `day` field against existing records
- New days → added to the front (newest-first order preserved)
- Existing days → skipped (or updated if "update" mode is selected)
- Automatic backup to `journal_backup.json` is created before every write
- You never need to paste the full diary — only new entries

### npcs.json — NPC database

Array of NPC objects. `id` is the deduplication key.

```json
{
  "id": "korvin_dalton",
  "name": "Корвін Далтон",
  "role": "Торговець",
  "relation": "ally",       // "ally" | "neutral" | "hostile"
  "avatar": "🧙",
  "location": "Невервінтер",
  "description": "..."
}
```

Bulk import available in admin (deduplication by `name`+`role`).

### character.json — Character stats

Flat object: `level`, `hp`, `max_hp`, `ac`, `xp`, top-level stat arrays, features list, etc.
Admin quick-edit covers: HP, level, XP, AC.

### inventory.json — Equipment & backpack

```json
{
  "wallet": { "gold": 774, "silver": 3, "copper": 0 },
  "equipped": { "head": {...}, "body": {...}, ... },
  "backpack": [ { "name": "...", "desc": "..." }, ... ]
}
```

Backpack is a flat array (up to 48 items displayed in 6-column grid).

### spells.json — Spells & abilities

Contains `cantrips[]`, `spells[]`, `invocations[]`, `pact_slots` object. Each spell: `name`, `level`, `school`, `desc`, `ritual` (bool).

---

## Admin panel tabs

| Tab | What it does |
|---|---|
| **JSON Editor** | Raw edit of any data file with validation, formatting, clipboard paste |
| **Щоденник (Journal)** | Add single entry via form; bulk import new entries; create/restore backup |
| **Інвентар (Inventory)** | Edit coins; paste backpack JSON array |
| **НПС (NPCs)** | Add single NPC via form; bulk import with dedup |
| **Персонаж (Character)** | Quick update HP, level, AC, XP |

---

## CSS conventions

- Dark fantasy palette via CSS variables: `--gold`, `--text`, `--bg-deep`, `--crimson-l`, etc.
- All defined in `css/style.css` at the top — change variables, not individual colors.
- Responsive: stat grids, NPC cards, backpack grid (6 columns) all use CSS Grid.
- Scrollbar, noise texture, and transitions are global.

## JS conventions

- **No framework, no bundler** — vanilla ES2020+ modules via `<script type="module">`.
- `main.js` exports `renderNav(active)`, `loadJSON(path)`, `notify(msg, isError)`.
- Each page imports what it needs inline.
- GitHub API calls are all in `admin.js`: `ghGet(path)`, `ghPut(path, content, msg, sha)`.
- All writes first fetch the current SHA, then PUT with the SHA to avoid conflicts.

---

## Deployment

GitHub Pages from `main` branch, root directory. Push to `main` → live in ~30 seconds. No CI needed.
