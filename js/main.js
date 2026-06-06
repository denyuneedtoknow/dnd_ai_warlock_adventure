// ─── NAV ─────────────────────────────────────────────────────────────────────
function renderNav(active) {
  const toPagePath = (href) =>
    href.startsWith("pages/") ? href : `pages/${href}`;
  const activePath = toPagePath(active);

  const pages = [
    { href: toPagePath("index.html"), label: "Головна", icon: "🏠" },
    { href: toPagePath("character.html"), label: "Персонаж", icon: "🧙" },
    { href: toPagePath("inventory.html"), label: "Інвентар", icon: "🎒" },
    { href: toPagePath("spells.html"), label: "Закляття", icon: "✨" },
    { href: toPagePath("npcs.html"), label: "Персонажі", icon: "👥" },
    { href: toPagePath("journal.html"), label: "Щоденник", icon: "📖" },
  ];

  let items = [...pages];
  if (active === "index.html") {
    items.push({
      href: toPagePath("admin.html"),
      label: "Адмін",
      icon: "⚙️",
      extraClass: "nav-admin",
    });
  } else if (active === "admin.html") {
    items = pages
      .filter((p) => p.href !== toPagePath("index.html"))
      .concat([{ href: toPagePath("index.html"), label: "Головна", icon: "🏠" }]);
  }

  const links = items
    .map((p) => {
      const cls = [p.href === activePath ? "active" : "", p.extraClass || ""]
        .filter(Boolean)
        .join(" ");
      return `<li><a href="${p.href}" class="${cls}" aria-label="${p.label}"><span class="nav-link-icon">${p.icon}</span><span class="nav-link-label">${p.label}</span></a></li>`;
    })
    .join("");

  const current =
    active === "admin.html"
      ? { label: "Адмін" }
      : items.find((p) => p.href === activePath) || items[0];

  return `
    <nav class="site-nav" aria-label="Головна навігація">
      <div class="nav-bar">
        <span class="nav-current">${current.label}</span>
        <button
          type="button"
          class="nav-burger"
          aria-expanded="false"
          aria-controls="nav-menu"
          aria-label="Відкрити меню"
        >
          <span class="nav-burger-line"></span>
          <span class="nav-burger-line"></span>
          <span class="nav-burger-line"></span>
        </button>
      </div>
      <ul class="nav-links" id="nav-menu">${links}</ul>
    </nav>`;
}

function closeSiteNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  nav.classList.remove("nav-open");
  document.body.classList.remove("nav-menu-open");
  const burger = nav.querySelector(".nav-burger");
  if (burger) {
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Відкрити меню");
  }
}

function toggleSiteNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  const open = !nav.classList.contains("nav-open");
  nav.classList.toggle("nav-open", open);
  document.body.classList.toggle("nav-menu-open", open);
  const burger = nav.querySelector(".nav-burger");
  if (burger) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрити меню" : "Відкрити меню");
  }
}

(function initSiteNavHandlers() {
  if (document.documentElement.dataset.navHandlers) return;
  document.documentElement.dataset.navHandlers = "1";

  document.addEventListener("click", (e) => {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;

    if (e.target.closest(".nav-burger")) {
      toggleSiteNav();
      return;
    }

    if (e.target.closest(".nav-links a")) {
      closeSiteNav();
      return;
    }

    if (nav.classList.contains("nav-open") && !nav.contains(e.target)) {
      closeSiteNav();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSiteNav();
  });
})();

// ─── FETCH JSON ───────────────────────────────────────────────────────────────
async function loadJSON(path) {
  const res = await fetch(path + "?t=" + Date.now());
  if (!res.ok) throw new Error("Failed to load " + path);
  return res.json();
}

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
let tooltip = null;

function initTooltip() {
  tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  document.body.appendChild(tooltip);

  document.addEventListener("mousemove", (e) => {
    if (!tooltip.classList.contains("visible")) return;
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    tooltip.style.left =
      (x + 210 > window.innerWidth ? e.clientX - 220 : x) + "px";
    tooltip.style.top =
      (y + 150 > window.innerHeight ? e.clientY - 160 : y) + "px";
  });
}

function showTooltip(item) {
  if (!tooltip) return;
  tooltip.innerHTML = `
    <div class="tooltip-name">${item.name}</div>
    <div class="tooltip-type">${item.type || ""}${item.rarity ? " · " + item.rarity : ""}</div>
    <div class="tooltip-desc">${item.description || ""}</div>
  `;
  tooltip.classList.add("visible");
}

function hideTooltip() {
  if (tooltip) tooltip.classList.remove("visible");
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function notify(msg, isError = false) {
  let el = document.getElementById("notif");
  if (!el) {
    el = document.createElement("div");
    el.id = "notif";
    el.className = "notification";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "notification" + (isError ? " error" : "");
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

// ─── MOD ──────────────────────────────────────────────────────────────────────
function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return (m >= 0 ? "+" : "") + m;
}
