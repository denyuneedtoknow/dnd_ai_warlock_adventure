// ─── CONFIG ───────────────────────────────────────────────────────────────────
const REPO_OWNER = 'denyuneedtoknow';
const REPO_NAME  = 'dnd_ai_warlock_adventure';
const BRANCH     = 'main';

// ─── TOKEN ────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('dnd_gh_token'); }

function saveToken() {
  const t = document.getElementById('token-input').value.trim();
  if (!t) { notify('Введи токен', true); return; }
  localStorage.setItem('dnd_gh_token', t);
  showAdminSection();
}

function clearToken() {
  localStorage.removeItem('dnd_gh_token');
  document.getElementById('token-input').value = '';
  notify('Токен очищено');
}

function logout() {
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('login-section').style.display = 'block';
}

function showAdminSection() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-section').style.display = 'block';
  loadAllData();
}

// ─── GITHUB API ───────────────────────────────────────────────────────────────
async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
    }
  });
  if (!res.ok) throw new Error('GH GET failed: ' + res.status);
  return res.json();
}

async function ghPut(path, content, message, sha) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'GH PUT failed');
  }
  return res.json();
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  journal:   { data: [], sha: null },
  inventory: { data: {}, sha: null },
  npcs:      { data: [], sha: null },
  character: { data: {}, sha: null },
};

async function loadFile(key, path) {
  try {
    const file = await ghGet(path);
    state[key].sha  = file.sha;
    state[key].data = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))));
  } catch (e) {
    console.error('Failed to load', path, e);
    notify('Не вдалось завантажити ' + path, true);
  }
}

async function loadAllData() {
  notify('Завантажую дані...');
  await Promise.all([
    loadFile('journal',   'data/journal.json'),
    loadFile('inventory', 'data/inventory.json'),
    loadFile('npcs',      'data/npcs.json'),
    loadFile('character', 'data/character.json'),
  ]);
  renderJournalList();
  renderNpcList();
  fillInventoryForm();
  fillCharForm();
  notify('Дані завантажено ✓');
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────────
async function addJournalEntry() {
  const day      = parseInt(document.getElementById('j-day').value);
  const date_real = document.getElementById('j-date').value;
  const location = document.getElementById('j-location').value.trim();
  const summary  = document.getElementById('j-summary').value.trim();
  const next_steps = document.getElementById('j-next').value.trim();

  if (!day || !location || !summary) {
    notify('Заповни День, Локацію та Що сталось', true);
    return;
  }

  const entry = { day, date_real, location, summary };
  if (next_steps) entry.next_steps = next_steps;

  // Add at beginning (newest first)
  state.journal.data.unshift(entry);

  try {
    await ghPut('data/journal.json', state.journal.data,
      `📖 Щоденник: День ${day} — ${location}`, state.journal.sha);
    // Reload sha
    await loadFile('journal', 'data/journal.json');
    renderJournalList();
    // Clear form
    ['j-day','j-location','j-summary','j-next'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('j-date').value = new Date().toISOString().split('T')[0];
    notify('Запис додано ✓');
  } catch (e) {
    state.journal.data.shift(); // rollback
    notify('Помилка: ' + e.message, true);
  }
}

function renderJournalList() {
  const el = document.getElementById('journal-entries-list');
  if (!el) return;
  el.innerHTML = state.journal.data.map((e, i) => `
    <div class="journal-entry" style="margin-bottom:.75rem">
      <div class="journal-header">
        <span class="journal-day">День ${e.day}</span>
        <span class="journal-location">📍 ${e.location}</span>
        <span class="journal-date-real">${e.date_real || ''}</span>
        <button class="btn btn-danger" style="padding:.2rem .6rem;font-size:.6rem;margin-left:auto"
          onclick="deleteJournalEntry(${i})">✕</button>
      </div>
      <div class="journal-summary" style="font-size:.88rem">${e.summary}</div>
      ${e.next_steps ? `<div class="journal-next" style="font-size:.82rem">▶ ${e.next_steps}</div>` : ''}
    </div>
  `).join('');
}

async function deleteJournalEntry(index) {
  if (!confirm('Видалити запис?')) return;
  const removed = state.journal.data.splice(index, 1)[0];
  try {
    await ghPut('data/journal.json', state.journal.data,
      `🗑 Видалено запис Дня ${removed.day}`, state.journal.sha);
    await loadFile('journal', 'data/journal.json');
    renderJournalList();
    notify('Запис видалено');
  } catch (e) {
    state.journal.data.splice(index, 0, removed);
    notify('Помилка: ' + e.message, true);
  }
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function fillInventoryForm() {
  const d = state.inventory.data;
  document.getElementById('inv-gold').value   = d.gold   ?? 0;
  document.getElementById('inv-silver').value = d.silver ?? 0;
  document.getElementById('inv-copper').value = d.copper ?? 0;
  document.getElementById('inv-backpack-json').value =
    JSON.stringify(d.backpack || [], null, 2);
}

async function saveCoins() {
  state.inventory.data.gold   = parseInt(document.getElementById('inv-gold').value)   || 0;
  state.inventory.data.silver = parseInt(document.getElementById('inv-silver').value) || 0;
  state.inventory.data.copper = parseInt(document.getElementById('inv-copper').value) || 0;
  try {
    await ghPut('data/inventory.json', state.inventory.data,
      '💰 Оновлено гаманець', state.inventory.sha);
    await loadFile('inventory', 'data/inventory.json');
    notify('Гаманець збережено ✓');
  } catch (e) { notify('Помилка: ' + e.message, true); }
}

async function saveBackpack() {
  let parsed;
  try {
    parsed = JSON.parse(document.getElementById('inv-backpack-json').value);
  } catch {
    notify('Невірний JSON рюкзака', true); return;
  }
  state.inventory.data.backpack = parsed;
  try {
    await ghPut('data/inventory.json', state.inventory.data,
      '🎒 Оновлено рюкзак', state.inventory.sha);
    await loadFile('inventory', 'data/inventory.json');
    notify('Рюкзак збережено ✓');
  } catch (e) { notify('Помилка: ' + e.message, true); }
}

// ─── NPCS ─────────────────────────────────────────────────────────────────────
async function addNpc() {
  const name     = document.getElementById('npc-name').value.trim();
  const role     = document.getElementById('npc-role').value.trim();
  const relation = document.getElementById('npc-relation').value;
  const avatar   = document.getElementById('npc-avatar').value.trim() || '👤';
  const location = document.getElementById('npc-location').value.trim();
  const description = document.getElementById('npc-desc').value.trim();

  if (!name || !role) { notify('Вкажи Ім\'я та Роль', true); return; }

  const npc = {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name, role, relation, avatar, location, description
  };

  state.npcs.data.push(npc);
  try {
    await ghPut('data/npcs.json', state.npcs.data,
      `👤 Новий NPC: ${name}`, state.npcs.sha);
    await loadFile('npcs', 'data/npcs.json');
    renderNpcList();
    ['npc-name','npc-role','npc-avatar','npc-location','npc-desc'].forEach(id =>
      document.getElementById(id).value = '');
    notify(`${name} додано ✓`);
  } catch (e) {
    state.npcs.data.pop();
    notify('Помилка: ' + e.message, true);
  }
}

const RELATION_LABELS = { ally:'Союзник', neutral:'Нейтральний', hostile:'Ворог' };

function renderNpcList() {
  const el = document.getElementById('npc-list');
  if (!el) return;
  el.innerHTML = state.npcs.data.map((n, i) => `
    <div class="npc-card ${n.relation}" style="margin-bottom:.75rem">
      <div class="npc-card-top">
        <div class="npc-avatar">${n.avatar}</div>
        <div class="npc-info-top">
          <div class="npc-name">${n.name}</div>
          <div class="npc-role">${n.role}</div>
        </div>
        <span class="npc-relation">${RELATION_LABELS[n.relation]}</span>
        <button class="btn btn-danger" style="padding:.2rem .6rem;font-size:.6rem;margin-left:.5rem"
          onclick="deleteNpc(${i})">✕</button>
      </div>
      <div class="npc-card-body">
        <div class="npc-location">📍 ${n.location}</div>
      </div>
    </div>
  `).join('');
}

async function deleteNpc(index) {
  if (!confirm('Видалити NPC?')) return;
  const removed = state.npcs.data.splice(index, 1)[0];
  try {
    await ghPut('data/npcs.json', state.npcs.data,
      `🗑 Видалено NPC: ${removed.name}`, state.npcs.sha);
    await loadFile('npcs', 'data/npcs.json');
    renderNpcList();
    notify(`${removed.name} видалено`);
  } catch (e) {
    state.npcs.data.splice(index, 0, removed);
    notify('Помилка: ' + e.message, true);
  }
}

// ─── CHARACTER ────────────────────────────────────────────────────────────────
function fillCharForm() {
  const c = state.character.data;
  document.getElementById('char-hp').value      = c.hp      ?? '';
  document.getElementById('char-hp-max').value  = c.hp_max  ?? '';
  document.getElementById('char-level').value   = c.level   ?? '';
  document.getElementById('char-ac').value      = c.ac      ?? '';
  document.getElementById('char-xp').value      = c.xp      ?? '';
  document.getElementById('char-xp-next').value = c.xp_next ?? '';
}

async function saveCharStats() {
  const c = state.character.data;
  c.hp      = parseInt(document.getElementById('char-hp').value)      || c.hp;
  c.hp_max  = parseInt(document.getElementById('char-hp-max').value)  || c.hp_max;
  c.level   = parseInt(document.getElementById('char-level').value)   || c.level;
  c.ac      = parseInt(document.getElementById('char-ac').value)      || c.ac;
  c.xp      = parseInt(document.getElementById('char-xp').value)      || c.xp;
  c.xp_next = parseInt(document.getElementById('char-xp-next').value) || c.xp_next;

  try {
    await ghPut('data/character.json', c,
      `🧙 Оновлено персонажа (HP ${c.hp}/${c.hp_max}, Lv${c.level})`, state.character.sha);
    await loadFile('character', 'data/character.json');
    notify('Персонажа збережено ✓');
  } catch (e) { notify('Помилка: ' + e.message, true); }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function adminInit() {
  const token = getToken();
  if (token) {
    showAdminSection();
  }
}

// ─── JSON EDITOR ──────────────────────────────────────────────────────────────
async function loadJsonForEdit() {
  const path = document.getElementById('json-file-select').value;
  const statusEl = document.getElementById('json-status');
  statusEl.textContent = 'Завантажую...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    const file = await ghGet(path);
    const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
    const parsed = JSON.parse(decoded);
    document.getElementById('json-editor').value = JSON.stringify(parsed, null, 2);
    // store sha for this file
    window._jsonEditorSha = file.sha;
    statusEl.textContent = '✓ Завантажено';
    statusEl.style.color = 'var(--green-l)';
  } catch (e) {
    statusEl.textContent = 'Помилка: ' + e.message;
    statusEl.style.color = 'var(--crimson-l)';
  }
}

function validateJson() {
  const statusEl = document.getElementById('json-status');
  const val = document.getElementById('json-editor').value.trim();
  if (!val) { statusEl.textContent = ''; return; }
  try {
    JSON.parse(val);
    statusEl.textContent = '✓ JSON валідний';
    statusEl.style.color = 'var(--green-l)';
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.style.color = 'var(--crimson-l)';
  }
}

function formatJson() {
  const el = document.getElementById('json-editor');
  try {
    el.value = JSON.stringify(JSON.parse(el.value), null, 2);
    validateJson();
  } catch (e) {
    notify('Невірний JSON — спочатку виправ помилки', true);
  }
}

async function saveJsonFile() {
  const path = document.getElementById('json-file-select').value;
  const val = document.getElementById('json-editor').value.trim();
  const statusEl = document.getElementById('json-status');

  if (!val) { notify('Редактор порожній', true); return; }

  let parsed;
  try {
    parsed = JSON.parse(val);
  } catch (e) {
    notify('Невірний JSON: ' + e.message, true);
    return;
  }

  const fileName = path.split('/').pop();
  const sha = window._jsonEditorSha || null;

  statusEl.textContent = 'Зберігаю...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    await ghPut(path, parsed, `✏️ Оновлено ${fileName} через JSON-редактор`, sha);
    // reload sha
    const file = await ghGet(path);
    window._jsonEditorSha = file.sha;
    // sync to state if it's one of the known files
    const key = fileName.replace('.json','');
    if (state[key]) {
      state[key].data = parsed;
      state[key].sha  = file.sha;
      if (key === 'inventory')  fillInventoryForm();
      if (key === 'character')  fillCharForm();
      if (key === 'npcs')       renderNpcList();
      if (key === 'journal')    renderJournalList();
    }
    statusEl.textContent = '✓ Збережено';
    statusEl.style.color = 'var(--green-l)';
    notify(`${fileName} збережено ✓`);
  } catch (e) {
    statusEl.textContent = 'Помилка збереження';
    statusEl.style.color = 'var(--crimson-l)';
    notify('Помилка: ' + e.message, true);
  }
}
