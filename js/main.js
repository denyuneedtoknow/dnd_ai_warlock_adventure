// ─── NAV ─────────────────────────────────────────────────────────────────────
function renderNav(active) {
  const pages = [
    { href: 'index.html',     label: 'Головна' },
    { href: 'character.html', label: 'Персонаж' },
    { href: 'inventory.html', label: 'Інвентар' },
    { href: 'spells.html',    label: 'Закляття' },
    { href: 'npcs.html',      label: 'Персонажі' },
    { href: 'journal.html',   label: 'Щоденник' },
  ];
  const links = pages.map(p =>
    `<li><a href="${p.href}" class="${p.href === active ? 'active' : ''}">${p.label}</a></li>`
  ).join('');
  return `
    <nav>
      <a class="nav-brand" href="index.html">⚔ ДІОНІС</a>
      <ul class="nav-links">${links}</ul>
    </nav>`;
}

// ─── FETCH JSON ───────────────────────────────────────────────────────────────
async function loadJSON(path) {
  const res = await fetch(path + '?t=' + Date.now());
  if (!res.ok) throw new Error('Failed to load ' + path);
  return res.json();
}

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
let tooltip = null;

function initTooltip() {
  tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  document.body.appendChild(tooltip);

  document.addEventListener('mousemove', e => {
    if (!tooltip.classList.contains('visible')) return;
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    tooltip.style.left = (x + 210 > window.innerWidth ? e.clientX - 220 : x) + 'px';
    tooltip.style.top  = (y + 150 > window.innerHeight ? e.clientY - 160 : y) + 'px';
  });
}

function showTooltip(item) {
  if (!tooltip) return;
  tooltip.innerHTML = `
    <div class="tooltip-name">${item.name}</div>
    <div class="tooltip-type">${item.type || ''}${item.rarity ? ' · ' + item.rarity : ''}</div>
    <div class="tooltip-desc">${item.description || ''}</div>
  `;
  tooltip.classList.add('visible');
}

function hideTooltip() {
  if (tooltip) tooltip.classList.remove('visible');
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function notify(msg, isError = false) {
  let el = document.getElementById('notif');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notif';
    el.className = 'notification';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'notification' + (isError ? ' error' : '');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── MOD ──────────────────────────────────────────────────────────────────────
function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}
