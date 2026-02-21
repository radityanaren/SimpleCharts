export const ALL_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M",
];

// SVG icons
const IC = {
  cross: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  line: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/></svg>`,
  rect: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="1"/></svg>`,
  fib: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
  vp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="4" height="18"/><rect x="9" y="7" width="4" height="10"/><rect x="16" y="5" width="4" height="14"/></svg>`,
  long: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="9" width="16" height="7" rx="1" fill="rgba(38,166,154,0.4)" stroke="#26a69a"/><line x1="4" y1="12" x2="20" y2="12" stroke="#26a69a"/><rect x="4" y="16" width="16" height="4" rx="1" fill="rgba(239,83,80,0.3)" stroke="#ef5350"/></svg>`,
  short: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="7" rx="1" fill="rgba(239,83,80,0.4)" stroke="#ef5350"/><line x1="4" y1="10" x2="20" y2="10" stroke="#ef5350"/><rect x="4" y="10" width="16" height="4" rx="1" fill="rgba(38,166,154,0.3)" stroke="#26a69a"/></svg>`,
  caret: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`,
};

const TOOLS = [
  { id: "grab", icon: IC.cross, label: "+ Crosshair" },
  { id: "line", icon: IC.line, label: "Trend Line" },
  { id: "rect", icon: IC.rect, label: "Rectangle" },
  { id: "fib", icon: IC.fib, label: "Fibonacci" },
  { id: "vpfr", icon: IC.vp, label: "VP Range" },
  { id: "long", icon: IC.long, label: "Long Position" },
  { id: "short", icon: IC.short, label: "Short Position" },
];

// Public

export function buildUI(root) {
  root.innerHTML = "";
  root.style.cssText =
    'width:100vw;height:100vh;background:#0f1117;display:flex;flex-direction:column;font-family:"IBM Plex Sans",sans-serif;color:#e5e7eb;overflow:hidden';
  injectStyles();

  const topbar = el("div", "topbar");

  // Symbol search
  const searchWrap = el("div", "search-wrap");
  const searchInput = el("input", "search-input");
  searchInput.type = "text";
  searchInput.placeholder = "Search symbol…";
  searchInput.autocomplete = "off";
  const symDrop = el("div", "sym-drop hidden");
  searchWrap.append(searchInput, symDrop);
  topbar.append(searchWrap, sep());

  // TF dropdown
  const tfWrap = el("div", "tf-wrap");
  const tfBtn = el("button", "dd-btn");
  tfBtn.innerHTML = `<span class="cur-label">1m</span>${IC.caret}`;
  const tfDrop = el("div", "dd-panel hidden");
  tfWrap.append(tfBtn, tfDrop);
  const tfBtns = {};
  for (const tf of ALL_TIMEFRAMES) {
    const b = el("button", "dd-item");
    b.textContent = tf;
    b.dataset.tf = tf;
    tfBtns[tf] = b;
    tfDrop.appendChild(b);
  }
  tfBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    tfDrop.classList.toggle("hidden");
  });
  topbar.append(tfWrap, sep());

  // Tool dropdown
  const toolWrap = el("div", "tf-wrap"); // reuse same style
  const toolBtn = el("button", "dd-btn dd-tool-btn");
  const toolDrop = el("div", "dd-panel hidden");

  // Build tool items
  const toolBtns = {};
  for (const t of TOOLS) {
    const b = el("button", "dd-item dd-tool-item");
    b.dataset.tool = t.id;
    b.innerHTML = `<span class="tool-ic">${t.icon}</span><span>${t.label}</span>`;
    toolBtns[t.id] = b;
    toolDrop.appendChild(b);
  }
  toolWrap.append(toolBtn, toolDrop);
  toolBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAll();
    toolDrop.classList.toggle("hidden");
  });
  topbar.append(toolWrap, sep());

  // set initial active tool display
  _setToolLabel(toolBtn, TOOLS[0]);

  // Price tag
  const priceTag = el("div", "price-tag");
  topbar.append(priceTag);

  // Chart area
  const chartArea = el("div", "chart-area");
  const canvas = document.createElement("canvas");
  canvas.className = "main-canvas";
  chartArea.append(canvas);
  const loadingOverlay = el("div", "loading-overlay hidden");
  loadingOverlay.textContent = "Loading…";
  chartArea.append(loadingOverlay);
  const autoFitBtn = el("button", "autofit-btn");
  autoFitBtn.title = "Auto fit";
  autoFitBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  chartArea.append(autoFitBtn);

  root.append(topbar, chartArea);

  function closeAll() {
    tfDrop.classList.add("hidden");
    toolDrop.classList.add("hidden");
  }
  document.addEventListener("click", closeAll);

  return {
    searchInput,
    symDrop,
    tfBtn,
    tfDrop,
    tfBtns,
    toolBtn,
    toolDrop,
    toolBtns,
    priceTag,
    canvas,
    loadingOverlay,
    autoFitBtn,
  };
}

export function setActiveTf(tfBtns, tfBtn, active) {
  Object.values(tfBtns).forEach((b) =>
    b.classList.toggle("dd-active", b.dataset.tf === active),
  );
  tfBtn.querySelector(".cur-label").textContent = active;
}

export function updateTfAvailability(tfBtns, supported) {
  for (const [tf, b] of Object.entries(tfBtns)) {
    const ok = !supported || supported.includes(tf);
    b.style.display = ok ? "" : "none";
    b.disabled = !ok;
  }
}

export function setActiveTool(ui, toolId) {
  const active = toolId || "grab";
  const def = TOOLS.find((t) => t.id === active) || TOOLS[0];

  // Update dropdown button label
  _setToolLabel(ui.toolBtn, def);

  // Highlight active item inside dropdown
  Object.values(ui.toolBtns).forEach((b) =>
    b.classList.toggle("dd-active", b.dataset.tool === active),
  );

  // Cursor
  const cv = document.querySelector(".main-canvas");
  if (cv) cv.style.cursor = active === "grab" ? "" : "crosshair";
}

export function renderDropdown(dropdown, symbols, query, onSelect) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? symbols.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.value.toLowerCase().includes(q),
      )
    : symbols;
  dropdown.innerHTML = "";
  if (!filtered.length) {
    dropdown.classList.add("hidden");
    return;
  }
  for (const sym of filtered.slice(0, 60)) {
    const item = el("div", "dd-item sym-item");
    const src = sym.source ?? "us";
    const badge = el("span", "dd-badge");
    badge.textContent = src.toUpperCase();
    _applyBadgeStyle(badge, src);
    item.append(badge, document.createTextNode(sym.label));
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onSelect(sym);
    });
    dropdown.appendChild(item);
  }
  if (filtered.length > 60) {
    const h = el("div", "dd-hint");
    h.textContent = `+${filtered.length - 60} more — type to filter`;
    dropdown.appendChild(h);
  }
  dropdown.classList.remove("hidden");
}

export function updatePrice(priceTag, candle, prevClose) {
  if (!candle) return;
  const ch = prevClose ? ((candle.close - prevClose) / prevClose) * 100 : 0;
  const up = ch >= 0;
  priceTag.innerHTML = `<span class="pv">${_fmt(candle.close)}</span><span class="pc ${up ? "up" : "dn"}">${up ? "+" : ""}${ch.toFixed(2)}%</span>`;
}

// Internals

function _setToolLabel(btn, toolDef) {
  btn.innerHTML = `<span class="tool-ic">${toolDef.icon}</span><span class="cur-label">${toolDef.label}</span>${IC.caret}`;
}

function _applyBadgeStyle(el, source) {
  // Well known sources get intentional brand colors.
  const KNOWN = {
    crypto: { bg: "#1e3a2f", fg: "#26a69a" },
    idx: { bg: "#1a2e4a", fg: "#3b82f6" },
    us: { bg: "#2e1a3a", fg: "#a78bfa" },
    python: { bg: "#2e2a1a", fg: "#f59e0b" },
  };
  if (KNOWN[source]) {
    el.style.background = KNOWN[source].bg;
    el.style.color = KNOWN[source].fg;
    return;
  }
  // Unknown source → deterministically derive a color from the name so it
  // always looks consistent without any extra config.
  let hash = 0;
  for (let i = 0; i < source.length; i++)
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  el.style.background = `hsl(${hue},35%,18%)`;
  el.style.color = `hsl(${hue},70%,65%)`;
}

function sep() {
  return el("div", "tb-sep");
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) cls.split(" ").forEach((c) => c && e.classList.add(c));
  return e;
}

function _fmt(p) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function injectStyles() {
  if (document.getElementById("sc-styles")) return;
  const s = document.createElement("style");
  s.id = "sc-styles";
  s.textContent = `
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0 }
    html,body { width:100%; height:100%; background:#0f1117; overflow:hidden }
    #app { width:100%; height:100% }

    /* ── topbar ── */
    .topbar { display:flex; align-items:center; gap:4px; padding:0 12px;
      background:#151821; border-bottom:1px solid #1f2433; height:44px; flex-shrink:0 }
    .tb-sep { width:1px; height:20px; background:#1f2433; margin:0 3px; flex-shrink:0 }

    /* ── symbol search ── */
    .search-wrap { position:relative }
    .search-input { background:#1a1f2e; border:1px solid #2a3040; color:#e5e7eb;
      padding:5px 10px; border-radius:6px; font-size:13px;
      font-family:'IBM Plex Mono',monospace; width:155px; outline:none; transition:border-color .15s }
    .search-input:focus { border-color:#3b82f6 }

    /* ── shared dropdown panel ── */
    .sym-drop, .dd-panel {
      position:absolute; top:calc(100% + 5px); left:0;
      background:#1a1f2e; border:1px solid #2a3040; border-radius:8px;
      z-index:500; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,.6)
    }
    .sym-drop { width:230px; max-height:300px; overflow-y:auto }
    .dd-panel  { min-width:160px }
    .sym-drop.hidden, .dd-panel.hidden { display:none }
    .sym-drop::-webkit-scrollbar { width:4px }
    .sym-drop::-webkit-scrollbar-thumb { background:#2a3040; border-radius:4px }

    /* ── dropdown items ── */
    .dd-item {
      display:flex; align-items:center; gap:9px; width:100%;
      padding:8px 13px; background:none; border:none;
      color:#9ca3af; font-size:12px; font-family:'IBM Plex Mono',monospace;
      cursor:pointer; text-align:left; transition:background .1s, color .1s; white-space:nowrap
    }
    .dd-item:hover { background:#232938; color:#e5e7eb }
    .dd-item.dd-active { color:#3b82f6; background:#172032 }

    /* symbol-search items are div, not button */
    .sym-item { font-size:13px; padding:7px 12px }

    .dd-hint { padding:5px 12px; font-size:11px; color:#4b5563;
      font-family:'IBM Plex Mono',monospace; border-top:1px solid #1f2433 }
    .dd-badge { font-size:10px; font-family:'IBM Plex Mono',monospace;
      padding:2px 5px; border-radius:3px; font-weight:600; flex-shrink:0 }

    /* ── dropdown trigger button (TF + Tool) ── */
    .tf-wrap { position:relative }
    .dd-btn {
      display:flex; align-items:center; gap:6px;
      background:#1a1f2e; border:1px solid #2a3040; color:#e5e7eb;
      padding:4px 9px; border-radius:6px; cursor:pointer;
      font-size:12px; font-family:'IBM Plex Mono',monospace;
      white-space:nowrap; outline:none; transition:border-color .15s
    }
    .dd-btn:hover { border-color:#3b4a60 }
    .dd-tool-btn { gap:7px }
    .tool-ic { display:flex; align-items:center; flex-shrink:0 }
    .cur-label { flex:1 }

    /* ── price tag ── */
    .price-tag { display:flex; align-items:center; gap:8px; margin-left:auto;
      font-family:'IBM Plex Mono',monospace }
    .pv { font-size:14px; font-weight:500; color:#e5e7eb }
    .pc { font-size:12px; padding:2px 6px; border-radius:4px }
    .pc.up { background:#1e3a2f; color:#26a69a }
    .pc.dn { background:#3a1e1e; color:#ef5350 }

    /* ── chart area ── */
    .chart-area { flex:1; position:relative; overflow:hidden; min-height:0 }
    .main-canvas { display:block; position:absolute; top:0; left:0 }
    .autofit-btn {
      position:absolute; right:12px; bottom:36px;
      background:rgba(21,24,33,.9); border:1px solid #2a3040; color:#6b7280;
      width:28px; height:28px; border-radius:6px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      transition:all .15s; z-index:10; backdrop-filter:blur(4px)
    }
    .autofit-btn:hover { color:#e5e7eb; border-color:#3b4a60 }
    .loading-overlay {
      position:absolute; inset:0; background:rgba(15,17,23,.75);
      display:flex; align-items:center; justify-content:center;
      font-size:13px; color:#6b7280; font-family:'IBM Plex Mono',monospace;
      pointer-events:none; z-index:5
    }
    .loading-overlay.hidden { display:none }
  `;
  document.head.appendChild(s);
}
