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

/** Поточний blob sha для шляху, або null якщо файлу ще нема (створення). */
async function ghGetBlobSha(path) {
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GH GET failed: ' + res.status);
  const file = await res.json();
  return file.sha;
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
    let detail = 'GH PUT failed: ' + res.status;
    try {
      const err = await res.json();
      if (err.message) detail = err.message;
      if (Array.isArray(err.errors) && err.errors.length) {
        detail += ' — ' + err.errors.map(e => e.message || JSON.stringify(e)).join('; ');
      }
    } catch { /* ignore */ }
    throw new Error(detail);
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
    await createJournalBackup(); // Бекап попередньої версії
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
    await createJournalBackup(); // Бекап попередньої версії
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

// ─── JOURNAL BACKUP ───────────────────────────────────────────────────────────
async function createJournalBackup() {
  if (!state.journal.data || state.journal.data.length === 0) {
    notify('Немає даних для бекапу', true);
    return;
  }

  try {
    await ghPut('data/journal_backup.json', state.journal.data,
      `💾 Створено бекап щоденника (${state.journal.data.length} записів)`, null);
    notify(`Бекап створено: data/journal_backup.json (${state.journal.data.length} записів) ✓`);
  } catch (e) {
    notify('Не вдалося створити бекап: ' + e.message, true);
  }
}

async function restoreFromBackup() {
  if (!confirm('Відновити щоденник з бекапу? Поточна версія буде повністю замінена.')) {
    return;
  }

  try {
    const backupFile = await ghGet('data/journal_backup.json');
    const decoded = decodeURIComponent(escape(atob(backupFile.content.replace(/\n/g, ''))));
    const backupData = JSON.parse(decoded);

    await ghPut('data/journal.json', backupData,
      `↩ Відновлено з бекапу (${backupData.length} записів)`, state.journal.sha);

    await loadFile('journal', 'data/journal.json');
    renderJournalList();
    notify(`Відновлено ${backupData.length} записів з бекапу ✓`);
  } catch (e) {
    notify('Не вдалося відновити з бекапу. Перевірте, чи існує journal_backup.json. Помилка: ' + e.message, true);
  }
}

// ─── JOURNAL IMPORT ───────────────────────────────────────────────────────────
async function pasteJournalImport() {
  const el = document.getElementById('journal-import-json');
  if (!el) return;

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    notify('Буфер обміну недоступний у цьому браузері', true);
    return;
  }
  try {
    let text = await navigator.clipboard.readText();
    if (!text.trim()) {
      notify('Буфер обміну порожній', true);
      return;
    }
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    el.value = text.trim();
    notify('JSON вставлено в поле імпорту щоденника ✓');
  } catch (e) {
    notify('Не вдалося прочитати буфер обміну', true);
  }
}

async function importJournalEntries() {
  const el = document.getElementById('journal-import-json');
  const modeEl = document.getElementById('journal-import-dup-mode');
  if (!el) return;
  const dupMode = modeEl && modeEl.value === 'update' ? 'update' : 'skip';

  let text = el.value.trim();
  if (!text) { notify('Встав JSON-масив записів щоденника', true); return; }
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let arr;
  try { arr = JSON.parse(text); } catch (e) {
    notify('Невірний JSON: ' + e.message, true);
    return;
  }
  if (!Array.isArray(arr)) { notify('Очікується масив [ ... ]', true); return; }

  const backup = JSON.parse(JSON.stringify(state.journal.data));
  const daysSeen = new Set(state.journal.data.map(e => e.day));
  const processedDays = new Set();

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const warnLines = [];

  // Обробляємо у зворотному порядку, щоб нові записи залишались зверху
  for (let i = arr.length - 1; i >= 0; i--) {
    const raw = arr[i];
    if (!raw || typeof raw !== 'object') continue;

    const day = parseInt(raw.day);
    if (!day || isNaN(day)) {
      skipped++;
      continue;
    }

    const key = day;
    if (processedDays.has(key)) {
      skipped++;
      warnLines.push(`Повтор дня ${day} у файлі`);
      continue;
    }

    const existingIndex = state.journal.data.findIndex(e => e.day === day);
    const entry = {
      day: day,
      date_real: raw.date_real || '',
      location: String(raw.location || '').trim(),
      summary: String(raw.summary || '').trim()
    };
    if (raw.next_steps) entry.next_steps = String(raw.next_steps).trim();

    if (existingIndex >= 0) {
      processedDays.add(key);
      if (dupMode === 'update') {
        state.journal.data[existingIndex] = entry;
        updated++;
      } else {
        skipped++;
        warnLines.push(`День ${day} вже існує (пропущено)`);
      }
      continue;
    }

    // Додаємо на початок (newest first)
    state.journal.data.unshift(entry);
    added++;
    processedDays.add(key);
  }

  const changed = added + updated;
  if (!changed) {
    state.journal.data = backup;
    if (skipped === 0) {
      notify('Немає валідних записів (потрібен day у кожному елементі)', true);
    } else {
      const detail = warnLines.length ? ' — ' + warnLines.slice(0, 4).join(' · ') : '';
      notify(`Змін не зроблено. Пропущено ${skipped} записів${detail}`, true);
    }
    return;
  }

  const msg = `Імпорт щоденника: +${added} нових` +
    (updated ? `, оновлено ${updated}` : '') +
    (skipped ? `; пропущено ${skipped}` : '');

  try {
    await createJournalBackup(); // Бекап попередньої версії
    await ghPut('data/journal.json', state.journal.data,
      `📖 Імпорт ${added + updated} записів щоденника`, state.journal.sha);
    await loadFile('journal', 'data/journal.json');
    renderJournalList();
    el.value = '';
    if (warnLines.length) {
      notify(msg + ' — ' + warnLines.slice(0, 3).join(' · ') + (warnLines.length > 3 ? ' …' : ''));
    } else {
      notify(msg + ' ✓');
    }
  } catch (e) {
    state.journal.data = backup;
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

const NPC_RELATION_SET = new Set(['ally', 'neutral', 'hostile']);

function makeNpcIdFromName(name) {
  return name.toLowerCase().replace(/\s+/g, '_');
}

function nextUniqueId(baseId, usedIds) {
  let id = baseId;
  let n = 0;
  while (usedIds.has(id)) {
    n++;
    id = `${baseId}_${n}`;
  }
  usedIds.add(id);
  return id;
}

function parseNpcImportRaw(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim();
  const role = String(raw.role ?? '').replace(/\s+/g, ' ').trim();
  if (!name || !role) return null;

  let relation = (raw.relation != null && String(raw.relation).toLowerCase().trim()) || 'neutral';
  if (!NPC_RELATION_SET.has(relation)) relation = 'neutral';

  const avatar = (raw.avatar != null && String(raw.avatar).trim()) || '👤';
  const location = (raw.location != null && String(raw.location).trim()) || '';
  const description = (raw.description != null ? String(raw.description) : '').trim();

  return { name, role, relation, avatar, location, description };
}

function npcIdentityKey(name, role) {
  const n = String(name).replace(/\s+/g, ' ').trim().toLowerCase();
  const r = String(role).replace(/\s+/g, ' ').trim().toLowerCase();
  return `${n}\u0000${r}`;
}

function findNpcIndexByIdentity(data, key) {
  return data.findIndex(n => npcIdentityKey(n.name, n.role) === key);
}

async function pasteNpcImport() {
  const el = document.getElementById('npc-import-json');
  if (!el) return;

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    notify('Буфер обміну недоступний у цьому браузері', true);
    return;
  }
  try {
    let text = await navigator.clipboard.readText();
    if (!text.trim()) {
      notify('Буфер обміну порожній', true);
      return;
    }
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    el.value = text.trim();
    notify('JSON вставлено в поле імпорту ✓');
  } catch (e) {
    notify('Не вдалося прочитати буфер обміну', true);
  }
}

async function importNpcs() {
  const el = document.getElementById('npc-import-json');
  const modeEl = document.getElementById('npc-import-dup-mode');
  if (!el) return;
  const dupMode = modeEl && modeEl.value === 'update' ? 'update' : 'skip';

  let text = el.value.trim();
  if (!text) { notify('Встав JSON-масив NPC', true); return; }
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let arr;
  try { arr = JSON.parse(text); } catch (e) {
    notify('Невірний JSON: ' + e.message, true);
    return;
  }
  if (!Array.isArray(arr)) { notify('Очікується масив [ ... ]', true); return; }

  const backup = JSON.parse(JSON.stringify(state.npcs.data));
  const usedIds = new Set(state.npcs.data.map(n => n.id));
  const keysSeen = new Set();

  let added = 0;
  let updated = 0;
  let skippedInFile = 0;
  let skippedInList = 0;
  const warnLines = [];

  for (const raw of arr) {
    const parsed = parseNpcImportRaw(raw);
    if (!parsed) continue;

    const key = npcIdentityKey(parsed.name, parsed.role);
    if (keysSeen.has(key)) {
      skippedInFile++;
      warnLines.push(`Повтор у файлі: ${parsed.name} — ${parsed.role}`);
      continue;
    }

    const idx = findNpcIndexByIdentity(state.npcs.data, key);
    if (idx >= 0) {
      keysSeen.add(key);
      if (dupMode === 'update') {
        const id = state.npcs.data[idx].id;
        state.npcs.data[idx] = { id, ...parsed };
        updated++;
      } else {
        skippedInList++;
        warnLines.push(`Вже в списку (пропущено): ${parsed.name} — ${parsed.role}`);
      }
      continue;
    }

    let baseId;
    if (raw.id != null && String(raw.id).trim() !== '') {
      baseId = String(raw.id).trim().toLowerCase().replace(/\s+/g, '_');
    } else {
      baseId = makeNpcIdFromName(parsed.name);
    }
    const id = nextUniqueId(baseId, usedIds);
    state.npcs.data.push({ id, ...parsed });
    added++;
    keysSeen.add(key);
  }

  const changed = added + updated;
  if (!changed) {
    state.npcs.data = backup;
    if (!skippedInFile && !skippedInList && !warnLines.length) {
      notify('Немає валідних рядків (потрібні name і role у кожному елементі)', true);
    } else {
      const parts = [];
      if (skippedInFile) parts.push(`повтор у файлі: ${skippedInFile}`);
      if (skippedInList) parts.push(`вже в списку: ${skippedInList}`);
      const detail = warnLines.length ? ' — ' + warnLines.slice(0, 5).join(' · ') + (warnLines.length > 5 ? ' …' : '') : '';
      notify('Змін не зроблено. ' + parts.join(', ') + detail, true);
    }
    return;
  }

  const msg = `Імпорт: +${added} нових` + (updated ? `, оновлено ${updated}` : '') +
    (skippedInFile || skippedInList
      ? `; пропущено: ` +
        [skippedInFile ? `у файлі ${skippedInFile}` : '', skippedInList ? `у списку ${skippedInList}` : '']
          .filter(Boolean).join(', ')
      : '');

  try {
    await ghPut('data/npcs.json', state.npcs.data,
      `👤 Імпорт NPC: +${added}, оновлено ${updated}`, state.npcs.sha);
    await loadFile('npcs', 'data/npcs.json');
    renderNpcList();
    el.value = '';
    if (warnLines.length) {
      const extra = warnLines.length > 3 ? ' …' : '';
      notify(msg + ' — ' + warnLines.slice(0, 3).join(' · ') + extra);
    } else {
      notify(msg + ' ✓');
    }
  } catch (e) {
    state.npcs.data = backup;
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

async function pasteJsonFromClipboard() {
  const el = document.getElementById('json-editor');

  if (!navigator.clipboard || !navigator.clipboard.readText) {
    notify('Буфер обміну недоступний у цьому браузері', true);
    return;
  }

  try {
    let text = await navigator.clipboard.readText();
    if (!text.trim()) {
      notify('Буфер обміну порожній', true);
      return;
    }

    // Часто JSON копіюють у markdown-блоках ```json ... ```
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    el.value = text.trim();
    validateJson();
    notify('JSON вставлено з буфера ✓');
  } catch (e) {
    notify('Не вдалося прочитати буфер обміну', true);
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
  const stateKey = fileName.replace(/\.json$/, '');
  let sha =
    window._jsonEditorSha ||
    (state[stateKey] && state[stateKey].sha) ||
    null;
  if (!sha) sha = await ghGetBlobSha(path);

  statusEl.textContent = 'Зберігаю...';
  statusEl.style.color = 'var(--text-muted)';

  try {
    // Автоматичний бекап перед зміною journal
    if (path.includes('journal.json') && state.journal && state.journal.data && state.journal.data.length > 0) {
      await createJournalBackup();
    }

    await ghPut(path, parsed, `✏️ Оновлено ${fileName} через JSON-редактор`, sha);
    const file = await ghGet(path);
    window._jsonEditorSha = file.sha;
    const key = fileName.replace('.json', '');
    if (state[key]) {
      state[key].data = parsed;
      state[key].sha = file.sha;
      if (key === 'inventory') fillInventoryForm();
      if (key === 'character') fillCharForm();
      if (key === 'npcs') renderNpcList();
      if (key === 'journal') renderJournalList();
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
