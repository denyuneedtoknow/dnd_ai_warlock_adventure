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
├── index.html          # Landing: hero + AI DM chat (session start/restore/clear)
├── character.html      # Full character sheet (stats, saves, skills, features)
├── inventory.html      # Equipment paperdoll + 48-slot backpack + wallet
├── spells.html         # Spell list, pact magic, cantrips, invocations
├── npcs.html           # NPC directory with relation filter
├── journal.html        # Session diary, reverse chronological
├── admin.html          # Admin panel (GitHub PAT required)
├── play.html           # AI DM chat standalone (legacy, same logic as index.html)
├── api/
│   └── chat.js         # Vercel Edge function — Anthropic/Gemini, SSE streaming
├── css/
│   └── style.css       # Dark fantasy theme — CSS variables, responsive grids
├── js/
│   ├── main.js         # Shared: renderNav(), loadJSON(), tooltips, notify()
│   └── admin.js        # Admin: GitHub API, all CRUD operations
├── data/
│   ├── character.json
│   ├── inventory.json
│   ├── journal.json
│   ├── journal_backup.json   # Auto-created before every journal write
│   ├── npcs.json
│   └── spells.json
├── api/
│   ├── chat.js         # Vercel Edge — Anthropic/Gemini, SSE streaming + json mode
│   └── save-session.js # Vercel Edge — commits journal.json to GitHub via PAT
├── vercel.json         # Vercel config: Edge function maxDuration
└── package.json        # Minimal — needed for Vercel to recognise ES module syntax
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

**Hosting: Vercel** (з version_0.2, раніше GitHub Pages).

```
GitHub Repo (main branch)
    └── Vercel auto-deploy → production URL
              └── /api/chat → Edge Runtime (Anthropic / Gemini)
```

### Vercel project settings
- **Framework Preset:** Other
- **Build Command:** *(порожньо)*
- **Output Directory:** *(порожньо)*
- **Production Branch:** `main`

### Environment variables (Vercel Dashboard → Settings → Environment Variables)

| Key | Description |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `MODEL_PROVIDER` | `anthropic` або `gemini` |
| `ANTHROPIC_MODEL` | опціонально, дефолт `claude-sonnet-4-6` |
| `GEMINI_API_KEY` | потрібен якщо `MODEL_PROVIDER=gemini` |
| `GEMINI_MODEL` | опціонально, дефолт `gemini-2.0-flash` |
| `GITHUB_REPO` | `owner/repo` — потрібен для `/api/save-session` |
| `GITHUB_BRANCH` | опціонально, дефолт `main` |

### Оновлення даних
Admin panel (admin.html) комітить JSON файли через GitHub API → Vercel автоматично передеплоює (~1-2 хв).

---

## AI DM Chat (index.html)

Чат з Майстром вбудований в головну сторінку.

### Флоу сесії
1. **Нова сесія** — показується кнопка "⚔️ Почати сесію"; при кліку DM отримує контекст і відкриває сцену
2. **Активна сесія** — гравець пише, DM відповідає через SSE streaming
3. **Збереження** — кожне повідомлення автоматично зберігається в localStorage (`dnd_session_v1`)
4. **Відновлення** — при перезавантаженні сторінки сесія відновлюється автоматично
5. **Нова сесія** — кнопка "↺ Нова сесія" очищає localStorage і скидає чат (з підтвердженням)

### localStorage
- Ключ: `dnd_session_v1`
- Формат: JSON-масив `[{ role, content, _hidden? }, ...]`
- `_hidden: true` — повідомлення-ініціатор (opener від системи), не рендериться у чаті

### Завершення сесії
Кнопка "📓 Завершити сесію" (з'являється після старту):
1. Надсилає не-стрімінговий запит до `/api/chat` з `json: true` — DM генерує JSON-запис
2. Відкривається модалка з редагованими полями: день, дата, локація, опис, наступні кроки
3. "Зберегти" → POST до `/api/save-session` з `{ entry, pat, inventoryChanges?, npcChanges? }` → коміти journal.json + inventory.json + npcs.json через GitHub API
4. Після збереження — пропонує розпочати нову сесію

### Формат відповіді DM при підсумуванні
```json
{
  "journal_entry": { "day": 44, "date_real": "...", "location": "...", "summary": "...", "next_steps": "..." },
  "inventory_changes": { "add": [{"name":"...","desc":"..."}], "remove": ["назва"], "gold_delta": 0 },
  "npc_changes": {
    "add": [{ "id": "snake_id", "name": "...", "role": "...", "relation": "neutral", "avatar": "🧑", "location": "...", "description": "..." }],
    "update": [{ "id": "існуючий_id", "name": "Ім'я для відображення", "relation": "ally" }]
  }
}
```
Гравець бачить модалку з усіма трьома секціями, може відмітити галочками які застосовувати.
