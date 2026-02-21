import {
  buildUI,
  setActiveTf,
  renderDropdown,
  updatePrice,
  updateTfAvailability,
  setActiveTool,
} from "./ui.js";
import { CandleChart } from "./chart/candle.js";
import {
  loadSymbols,
  ALL_SYMBOLS,
  fetchCandles,
  subscribeRealtime,
  getSupportedTf,
} from "./data/index.js";
import { IndicatorManager } from "./indicators/manager.js";
import { VolumeMA } from "./indicators/volume-ma.js";
import { VPVR } from "./indicators/vpvr.js";
import { BigTrades } from "./indicators/big-trades.js";
import { DrawingManager } from "./indicators/drawing.js";
import { PythonSignal } from "./indicators/python-signal.js";

let chart = null;
let unsubscribe = null;
let currentSymbol = null;
let currentTf = "1m";
let isLoadingMore = false;
let firstCandleTime = null;
let indicatorManager = null;
let bigTrades = null;
let drawingManager = null;

async function waitForLayout(el) {
  return new Promise((r) => {
    const check = () =>
      el.clientWidth > 0 && el.clientHeight > 0
        ? r()
        : requestAnimationFrame(check);
    check();
  });
}

async function init() {
  const root = document.getElementById("app");
  const ui = buildUI(root);

  const {
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
  } = ui;

  await waitForLayout(canvas.parentElement);
  chart = new CandleChart(canvas);
  setActiveTf(tfBtns, tfBtn, currentTf);

  bigTrades = new BigTrades({ minUsdSize: 50_000 });
  indicatorManager = new IndicatorManager(chart);
  indicatorManager.add(new VolumeMA({ maPeriods: [20], volHeightPx: 80 }));
  indicatorManager.add(new VPVR());
  indicatorManager.add(bigTrades);
  indicatorManager.add(new PythonSignal());
  chart.indicatorManager = indicatorManager;

  drawingManager = new DrawingManager(chart, canvas);
  indicatorManager.drawingManager = drawingManager;
  drawingManager.onCommit = () => {
    setActiveTool(ui, "grab");
    chart._drawingActive = false;
  };

  function activateTool(id) {
    drawingManager.setTool(id);
    setActiveTool(ui, id);
    chart._drawingActive = id !== "grab";
    toolDrop.classList.add("hidden");
  }

  Object.values(toolBtns).forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      activateTool(b.dataset.tool);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") activateTool("grab");
  });

  loadingOverlay.classList.remove("hidden");
  loadingOverlay.textContent = "Loading symbols…";
  await loadSymbols(200);
  loadingOverlay.classList.add("hidden");

  async function load(symbol, tf, mode = "new") {
    if (mode !== "prepend") loadingOverlay.classList.remove("hidden");
    try {
      const endTime =
        mode === "prepend" && firstCandleTime ? firstCandleTime - 1 : null;
      const candles = await fetchCandles(symbol.value, tf, 500, endTime);
      if (!candles.length) return;

      const last = candles[candles.length - 1];
      const prev =
        candles.length > 1 ? candles[candles.length - 2].close : last.open;

      if (mode === "prepend") {
        chart.prependCandles(candles);
        firstCandleTime = chart.candles[0].time;
        bigTrades.updateTimeMap(chart.candles);
      } else {
        if (mode === "tf") chart.replaceCandles(candles);
        else chart.setCandles(candles);
        firstCandleTime = chart.candles[0].time;
        bigTrades.updateTimeMap(chart.candles);
        updatePrice(priceTag, last, prev);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      if (mode !== "prepend") loadingOverlay.classList.add("hidden");
    }
  }

  function startRealtime(symbol, tf) {
    if (unsubscribe) unsubscribe();
    unsubscribe = subscribeRealtime(symbol.value, tf, (candle) => {
      if (!chart.candles.length) return;
      chart.updateLast(candle);
      const len = chart.candles.length;
      updatePrice(
        priceTag,
        candle,
        len > 1 ? chart.candles[len - 2].close : null,
      );
    });
  }

  async function changeSymbol(symbol, tf) {
    const supported = getSupportedTf(symbol.value);
    const isNewSymbol = !currentSymbol || symbol.value !== currentSymbol.value;

    let safeTf = tf;
    if (supported && !supported.includes(tf)) safeTf = supported[0];

    if (isNewSymbol) drawingManager.switchSymbol(symbol.value);

    const mode = isNewSymbol ? "new" : "tf";
    currentSymbol = symbol;
    currentTf = safeTf;
    searchInput.value = symbol.label;
    symDrop.classList.add("hidden");
    tfDrop.classList.add("hidden");

    setActiveTf(tfBtns, tfBtn, safeTf);
    updateTfAvailability(tfBtns, supported);
    indicatorManager.onSymbolChange(symbol.value, symbol.source);

    await load(symbol, safeTf, mode);
    startRealtime(symbol, safeTf);
  }

  chart.onNeedMore = async () => {
    if (isLoadingMore) return;
    isLoadingMore = true;
    await load(currentSymbol, currentTf, "prepend");
    isLoadingMore = false;
  };

  for (const [tf, btn] of Object.entries(tfBtns)) {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      tfDrop.classList.add("hidden");
      changeSymbol(currentSymbol, tf);
    });
  }

  searchInput.addEventListener("input", () =>
    renderDropdown(symDrop, ALL_SYMBOLS, searchInput.value, (s) =>
      changeSymbol(s, currentTf),
    ),
  );
  searchInput.addEventListener("focus", () =>
    renderDropdown(symDrop, ALL_SYMBOLS, searchInput.value || "", (s) =>
      changeSymbol(s, currentTf),
    ),
  );
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) symDrop.classList.add("hidden");
  });

  autoFitBtn.addEventListener("click", () => chart.autoFit());

  changeSymbol(ALL_SYMBOLS[0], currentTf);
}

init();
