export class DrawingManager {
  constructor(chart, canvas) {
    this._chart = chart;
    this._canvas = canvas;
    this._tool = "grab";
    this._shapes = [];
    this._wip = null;
    this._sel = -1;
    this._drag = null;
    this._candles = [];
    this._symbolShapes = new Map();
    this._currentSymbolKey = null;

    const B = {
      down: this._onDown.bind(this),
      move: this._onMove.bind(this),
      up: this._onUp.bind(this),
      key: this._onKey.bind(this),
    };
    this._B = B;
    canvas.addEventListener("mousedown", B.down);
    canvas.addEventListener("mousemove", B.move);
    window.addEventListener("mouseup", B.up);
    window.addEventListener("keydown", B.key);
  }

  destroy() {
    this._canvas.removeEventListener("mousedown", this._B.down);
    this._canvas.removeEventListener("mousemove", this._B.move);
    window.removeEventListener("mouseup", this._B.up);
    window.removeEventListener("keydown", this._B.key);
  }

  setTool(id) {
    this._tool = id || "grab";
    this._wip = null;
    this._canvas.style.cursor = this._tool === "grab" ? "" : "crosshair";
  }

  getTool() {
    return this._tool;
  }

  clearAll() {
    this._shapes = [];
    this._sel = -1;
    this._wip = null;
    this._chart.draw();
  }

  // Called by IndicatorManager each draw so we can convert time→idx
  setCandles(candles) {
    this._candles = candles;
  }

  switchSymbol(key) {
    if (this._currentSymbolKey) {
      this._symbolShapes.set(
        this._currentSymbolKey,
        JSON.parse(JSON.stringify(this._shapes)),
      );
    }
    this._currentSymbolKey = key;
    const saved = this._symbolShapes.get(key);
    this._shapes = saved ? JSON.parse(JSON.stringify(saved)) : [];
    this._sel = -1;
    this._wip = null;
  }

  _layout() {
    return this._chart.indicatorManager?._lastLayout ?? null;
  }

  _toWorld(css_x, css_y, layout) {
    const {
      chartOx,
      chartOy,
      chartW,
      chartH,
      priceLo,
      priceHi,
      viewStart,
      viewCount,
      dpr,
    } = layout;
    const ox = chartOx / dpr,
      oy = chartOy / dpr,
      cw = chartW / dpr,
      ch = chartH / dpr;
    const idx = viewStart + ((css_x - ox) / cw) * viewCount;
    const price = priceHi - ((css_y - oy) / ch) * (priceHi - priceLo);
    // Convert fractional idx to time by interpolating candle timestamps
    const time = this._idxToTime(idx);
    return { time, price, idx };
  }

  _toCss(time, price, layout) {
    const {
      chartOx,
      chartOy,
      chartW,
      chartH,
      priceLo,
      priceHi,
      viewStart,
      viewCount,
      dpr,
    } = layout;
    const ox = chartOx / dpr,
      oy = chartOy / dpr,
      cw = chartW / dpr,
      ch = chartH / dpr;
    const idx = this._timeToIdx(time);
    return {
      x: ox + ((idx - viewStart) / viewCount) * cw,
      y: oy + ((priceHi - price) / (priceHi - priceLo)) * ch,
    };
  }

  _idxToTime(idx) {
    const C = this._candles;
    if (!C.length) return idx;
    const i = Math.round(idx);
    if (i <= 0) return C[0].time + Math.round(idx) * this._interval();
    if (i >= C.length - 1)
      return (
        C[C.length - 1].time +
        Math.round(idx - (C.length - 1)) * this._interval()
      );
    // Interpolate
    const frac = idx - Math.floor(idx);
    return C[Math.floor(idx)].time * (1 - frac) + C[Math.ceil(idx)].time * frac;
  }

  _timeToIdx(time) {
    const C = this._candles;
    if (!C.length) return 0;
    if (time <= C[0].time) return (time - C[0].time) / this._interval();
    if (time >= C[C.length - 1].time)
      return C.length - 1 + (time - C[C.length - 1].time) / this._interval();
    // Binary search
    let lo = 0,
      hi = C.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (C[mid].time <= time) lo = mid;
      else hi = mid;
    }
    if (C[hi].time === C[lo].time) return lo;
    return lo + (time - C[lo].time) / (C[hi].time - C[lo].time);
  }

  _interval() {
    const C = this._candles;
    if (C.length < 2) return 60000;
    let sum = 0,
      n = Math.min(10, C.length - 1);
    for (let i = 0; i < n; i++) sum += C[i + 1].time - C[i].time;
    return sum / n;
  }

  _mousePos(e) {
    const r = this._canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _hitHandles(pos, shape, layout) {
    const handles = this._shapeHandles(shape, layout);
    const HIT = 10;
    for (const [key, h] of Object.entries(handles)) {
      if (Math.hypot(pos.x - h.x, pos.y - h.y) < HIT) return key;
    }
    return null;
  }

  _hitBody(pos, shape, layout) {
    const BODY_PAD = 12;
    const { t1, p1, t2, p2, stopP, tool } = shape;
    const a = this._toCss(t1, p1, layout);
    const b = this._toCss(t2, p2, layout);
    let xMin = Math.min(a.x, b.x) - BODY_PAD;
    let xMax = Math.max(a.x, b.x) + BODY_PAD;
    let yMin = Math.min(a.y, b.y) - BODY_PAD;
    let yMax = Math.max(a.y, b.y) + BODY_PAD;
    if ((tool === "long" || tool === "short") && stopP !== undefined) {
      const stopY = this._toCss(t1, stopP, layout).y;
      yMin = Math.min(yMin, stopY - BODY_PAD);
      yMax = Math.max(yMax, stopY + BODY_PAD);
    }
    return pos.x >= xMin && pos.x <= xMax && pos.y >= yMin && pos.y <= yMax;
  }

  _hitDeleteBtn(pos, shape, layout) {
    const btn = this._deleteBtnPos(shape, layout);
    if (!btn) return false;
    return Math.hypot(pos.x - btn.x, pos.y - btn.y) < 12;
  }

  _deleteBtnPos(shape, layout) {
    const a = this._toCss(shape.t1, shape.p1, layout);
    const b = this._toCss(shape.t2, shape.p2, layout);
    let yTop = Math.min(a.y, b.y);
    // For long/short, the stop line may extend above the entry (short) or
    // below the target (long), so include it in the top calculation.
    if (
      (shape.tool === "long" || shape.tool === "short") &&
      shape.stopP !== undefined
    ) {
      const stopCss = this._toCss(shape.t1, shape.stopP, layout);
      yTop = Math.min(yTop, stopCss.y);
    }
    return { x: Math.max(a.x, b.x) + 16, y: yTop - 16 };
  }

  _shapeHandles(shape, layout) {
    const { t1, p1, t2, p2, stopP, tool } = shape;
    const a = this._toCss(t1, p1, layout);
    const b = this._toCss(t2, p2, layout);
    const h = { p1: a, p2: b };
    if ((tool === "long" || tool === "short") && stopP !== undefined) {
      const stopCss = this._toCss(t2, stopP, layout);
      h.top = b;
      h.bot = stopCss;
      delete h.p1;
      delete h.p2;
      h.entry = a;
    }
    return h;
  }

  _onDown(e) {
    const layout = this._layout();
    if (!layout) return;
    const pos = this._mousePos(e);

    if (this._tool === "grab") {
      if (this._sel !== -1) {
        if (this._hitDeleteBtn(pos, this._shapes[this._sel], layout)) {
          e._dmConsumed = true;
          e.stopPropagation();
          this._shapes.splice(this._sel, 1);
          this._sel = -1;
          this._chart.draw();
          return;
        }
      }

      if (this._sel !== -1) {
        const hKey = this._hitHandles(pos, this._shapes[this._sel], layout);
        if (hKey) {
          e._dmConsumed = true;
          e.stopPropagation();
          this._drag = {
            type: hKey,
            shapeIdx: this._sel,
            startLogi: this._toWorld(pos.x, pos.y, layout),
            startShape: JSON.parse(JSON.stringify(this._shapes[this._sel])),
          };
          return;
        }
      }

      for (let i = this._shapes.length - 1; i >= 0; i--) {
        if (this._hitBody(pos, this._shapes[i], layout)) {
          e._dmConsumed = true;
          e.stopPropagation();
          this._sel = i;
          this._drag = {
            type: "body",
            shapeIdx: i,
            startLogi: this._toWorld(pos.x, pos.y, layout),
            startShape: JSON.parse(JSON.stringify(this._shapes[i])),
          };
          this._chart.draw();
          return;
        }
      }

      if (this._sel !== -1) {
        this._sel = -1;
        this._chart.draw();
      }
      return;
    }

    e.stopPropagation();
    const w = this._toWorld(pos.x, pos.y, layout);

    if (!this._wip) {
      this._wip = this._makeShape(this._tool, w);
    } else {
      this._commitWip(w);
    }
    this._chart.draw();
  }

  _onMove(e) {
    const layout = this._layout();
    if (!layout) return;
    const pos = this._mousePos(e);

    if (this._drag) {
      e.stopPropagation();
      const cur = this._toWorld(pos.x, pos.y, layout);
      const orig = this._drag.startShape;
      const s = this._shapes[this._drag.shapeIdx];
      const dt = cur.time - this._drag.startLogi.time;
      const dp = cur.price - this._drag.startLogi.price;

      if (this._drag.type === "body") {
        s.t1 = orig.t1 + dt;
        s.p1 = orig.p1 + dp;
        s.t2 = orig.t2 + dt;
        s.p2 = orig.p2 + dp;
        if (orig.stopP !== undefined) s.stopP = orig.stopP + dp;
      } else if (this._drag.type === "p1") {
        s.t1 = orig.t1 + dt;
        s.p1 = orig.p1 + dp;
      } else if (this._drag.type === "p2") {
        s.t2 = orig.t2 + dt;
        s.p2 = orig.p2 + dp;
      } else if (this._drag.type === "entry") {
        s.t1 = orig.t1 + dt;
        s.t2 = orig.t2 + dt;
      } else if (this._drag.type === "top") {
        s.t2 = orig.t2 + dt;
        s.p2 = orig.p2 + dp;
      } else if (this._drag.type === "bot") {
        s.stopP = (orig.stopP ?? orig.p1) + dp;
      }

      this._chart.draw();
      return;
    }

    if (this._wip) {
      const w = this._toWorld(pos.x, pos.y, layout);
      this._updateWip(w);
      this._chart.draw();
    }
  }

  _onUp() {
    this._drag = null;
  }

  _onKey(e) {
    if (e.key === "Escape") {
      this._wip = null;
      if (this._tool !== "grab") this.setTool("grab");
      this._sel = -1;
      this._chart.draw();
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      this._sel !== -1 &&
      e.target === document.body
    ) {
      this._shapes.splice(this._sel, 1);
      this._sel = -1;
      this._chart.draw();
    }
  }

  _makeShape(tool, w) {
    const base = { tool, t1: w.time, p1: w.price, t2: w.time, p2: w.price };
    if (tool === "long") {
      base.p2 = w.price * 1.01;
      base.stopP = w.price * 0.99;
    } else if (tool === "short") {
      base.p2 = w.price * 0.99;
      base.stopP = w.price * 1.01;
    }
    return base;
  }

  _updateWip(w) {
    const s = this._wip;
    s.t2 = w.time;
    s.p2 = w.price;
    if (s.tool === "long") {
      const dist = Math.abs(s.p2 - s.p1);
      s.stopP = s.p1 - dist;
    } else if (s.tool === "short") {
      const dist = Math.abs(s.p2 - s.p1);
      s.stopP = s.p1 + dist;
    }
  }

  _commitWip(w) {
    this._updateWip(w);
    if (this._wip.tool !== "long" && this._wip.tool !== "short") {
      if (this._wip.t1 > this._wip.t2) {
        [this._wip.t1, this._wip.t2] = [this._wip.t2, this._wip.t1];
        [this._wip.p1, this._wip.p2] = [this._wip.p2, this._wip.p1];
      }
    }
    this._shapes.push(this._wip);
    this._sel = this._shapes.length - 1;
    this._wip = null;
    this._tool = "grab";
    this._canvas.style.cursor = "";
    if (this.onCommit) this.onCommit();
  }

  drawAll(ctx, layout) {
    this._candles = layout._candles || [];

    for (let i = 0; i < this._shapes.length; i++) {
      _drawShape(ctx, this._shapes[i], layout, false, i === this._sel, this);
    }
    if (this._wip) {
      _drawShape(ctx, this._wip, layout, true, false, this);
    }
  }
}

function _drawShape(ctx, shape, layout, isPreview, isSelected, dm) {
  const { tool, t1, p1, t2, p2, stopP } = shape;
  const {
    dpr,
    chartOx,
    chartOy,
    chartW,
    chartH,
    priceLo,
    priceHi,
    viewStart,
    viewCount,
  } = layout;

  // Convert world → canvas raw px via dm
  const c1 = dm._toCss(t1, p1, layout);
  const c2 = dm._toCss(t2, p2, layout);

  // Helpers in raw canvas px (layout values are already ×dpr)
  const ox = chartOx,
    oy = chartOy,
    cw = chartW,
    ch = chartH;
  const toXt = (t) => dm._toCss(t, p1, layout).x * dpr;
  const toY = (price) =>
    oy + ch - ((price - priceLo) / (priceHi - priceLo)) * ch;
  const toX = (t) => dm._toCss(t, 0, layout).x * dpr;

  // Canvas px from CSS px
  const x1 = c1.x * dpr,
    y1 = c1.y * dpr;
  const x2 = c2.x * dpr,
    y2 = c2.y * dpr;

  ctx.save();
  if (isPreview) ctx.globalAlpha = 0.62;

  // Clip to price pane
  ctx.beginPath();
  ctx.rect(ox, oy, cw, ch);
  ctx.clip();

  switch (tool) {
    case "text": {
      const rx = Math.min(x1, x2),
        ry = Math.min(y1, y2);
      const rw = Math.max(Math.abs(x2 - x1), 90 * dpr),
        rh = Math.max(Math.abs(y2 - y1), 24 * dpr);
      ctx.fillStyle = "rgba(26,31,46,0.9)";
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = dpr;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.font = `${11 * dpr}px "IBM Plex Mono"`;
      ctx.fillStyle = "#e5e7eb";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("Label", rx + 8 * dpr, ry + rh / 2);
      ctx.textBaseline = "alphabetic";
      break;
    }

    case "line": {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      _dot(ctx, x1, y1, 4 * dpr, "#3b82f6");
      _dot(ctx, x2, y2, 4 * dpr, "#3b82f6");
      _label(ctx, _fmt(p2), x2 + 8 * dpr, y2, "#3b82f6", dpr);
      break;
    }

    case "rect": {
      const rxl = Math.min(x1, x2),
        ryt = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1),
        rh = Math.abs(y2 - y1);
      ctx.fillStyle = "rgba(167,139,250,0.07)";
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1.5 * dpr;
      ctx.fillRect(rxl, ryt, rw, rh);
      ctx.strokeRect(rxl, ryt, rw, rh);
      _label(
        ctx,
        _fmt(Math.max(p1, p2)),
        Math.max(x1, x2) + 8 * dpr,
        Math.min(y1, y2),
        "#a78bfa",
        dpr,
      );
      _label(
        ctx,
        _fmt(Math.min(p1, p2)),
        Math.max(x1, x2) + 8 * dpr,
        Math.max(y1, y2),
        "#a78bfa",
        dpr,
      );
      break;
    }

    case "fib": {
      const hi = Math.max(p1, p2),
        lo = Math.min(p1, p2);
      const range = hi - lo;
      const LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const COLORS = [
        "#26a69a",
        "#3b82f6",
        "#6366f1",
        "#a78bfa",
        "#ec4899",
        "#f59e0b",
        "#26a69a",
      ];
      const xL = Math.min(x1, x2),
        xR = Math.max(x1, x2);
      for (let i = 0; i < LEVELS.length; i++) {
        const lp = hi - LEVELS[i] * range;
        const fy = toY(lp);
        if (fy < oy || fy > oy + ch) continue;
        ctx.strokeStyle = COLORS[i];
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash(
          i === 0 || i === LEVELS.length - 1 ? [] : [4 * dpr, 3 * dpr],
        );
        ctx.beginPath();
        ctx.moveTo(xL, fy);
        ctx.lineTo(xR, fy);
        ctx.stroke();
        ctx.setLineDash([]);
        _label(
          ctx,
          `${(LEVELS[i] * 100).toFixed(1)}%  ${_fmt(lp)}`,
          xR + 6 * dpr,
          fy,
          COLORS[i],
          dpr,
        );
      }
      break;
    }

    case "vpfr": {
      const candles = layout._candles;
      if (!candles?.length) break;
      const iLo = Math.max(
        0,
        Math.round(Math.min(dm._timeToIdx(t1), dm._timeToIdx(t2))),
      );
      const iHi = Math.min(
        candles.length - 1,
        Math.round(Math.max(dm._timeToIdx(t1), dm._timeToIdx(t2))),
      );
      if (iHi <= iLo) break;
      const xLeft = Math.min(x1, x2),
        xRight = Math.max(x1, x2);
      let pLo = Infinity,
        pHi = -Infinity;
      for (let i = iLo; i <= iHi; i++) {
        if (candles[i].low < pLo) pLo = candles[i].low;
        if (candles[i].high > pHi) pHi = candles[i].high;
      }
      if (!isFinite(pLo) || !isFinite(pHi) || pHi <= pLo) break;

      const BINS = 200;
      const step = (pHi - pLo) / BINS;
      const buyB = new Float64Array(BINS),
        sellB = new Float64Array(BINS);

      for (let i = iLo; i <= iHi; i++) {
        const c = candles[i],
          vol = c.volume ?? 0;
        if (!vol) continue;
        const bLo = Math.max(0, Math.floor((c.low - pLo) / step));
        const bHi = Math.min(BINS - 1, Math.floor((c.high - pLo) / step));
        const span = bHi - bLo + 1;
        const isBuy = c.close >= c.open;
        for (let b = bLo; b <= bHi; b++) {
          if (isBuy) buyB[b] += vol / span;
          else sellB[b] += vol / span;
        }
      }

      // ── POC ──────────────────────────────────────────────────────────────
      let poc = 0;
      for (let b = 1; b < BINS; b++)
        if (buyB[b] + sellB[b] > buyB[poc] + sellB[poc]) poc = b;

      // ── Value Area (70 %) ────────────────────────────────────────────────
      const totalV = Array.from(buyB).reduce((a, v, i) => a + v + sellB[i], 0);
      const vaTarget70 = totalV * 0.7;
      let vaSum = buyB[poc] + sellB[poc];
      let vaLo = poc,
        vaHi = poc;
      while (vaSum < vaTarget70 && (vaLo > 0 || vaHi < BINS - 1)) {
        const addUp = vaHi < BINS - 1 ? buyB[vaHi + 1] + sellB[vaHi + 1] : 0;
        const addDn = vaLo > 0 ? buyB[vaLo - 1] + sellB[vaLo - 1] : 0;
        if (addUp >= addDn) {
          vaHi++;
          vaSum += addUp;
        } else {
          vaLo--;
          vaSum += addDn;
        }
      }

      const maxBin = Math.max(...buyB.map((v, i) => v + sellB[i]));
      if (!maxBin) break;
      const maxBarW = Math.min((xRight - xLeft) * 0.55, 150 * dpr);

      // ── Draw bars ────────────────────────────────────────────────────────
      for (let b = 0; b < BINS; b++) {
        const total = buyB[b] + sellB[b];
        if (!total) continue;
        const bPrice = pLo + b * step;
        const by = toY(bPrice + step);
        const bh = Math.max(1, Math.abs(toY(bPrice) - by) - 0.5);
        const buyW = (buyB[b] / maxBin) * maxBarW;
        const sellW = (sellB[b] / maxBin) * maxBarW;
        const inVA = b >= vaLo && b <= vaHi;
        ctx.fillStyle = inVA ? "rgba(38,166,154,0.7)" : "rgba(38,166,154,0.32)";
        ctx.fillRect(xLeft, by, buyW, bh);
        ctx.fillStyle = inVA ? "rgba(239,83,80,0.7)" : "rgba(239,83,80,0.32)";
        ctx.fillRect(xLeft + buyW, by, sellW, bh);
      }

      // ── Value Area outline ───────────────────────────────────────────────
      const vaTopPrice = pLo + vaHi * step + step;
      const vaBotPrice = pLo + vaLo * step;
      const vaTopY = toY(vaTopPrice);
      const vaBotY = toY(vaBotPrice);
      let vaMaxW = 0;
      for (let b = vaLo; b <= vaHi; b++) {
        const w = ((buyB[b] + sellB[b]) / maxBin) * maxBarW;
        if (w > vaMaxW) vaMaxW = w;
      }
      ctx.save();
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.strokeStyle = "rgba(96,165,250,0.35)";
      ctx.lineWidth = dpr;
      ctx.strokeRect(xLeft, vaTopY, vaMaxW, vaBotY - vaTopY);
      ctx.setLineDash([]);
      ctx.restore();

      // ── VAH line ─────────────────────────────────────────────────────────
      ctx.setLineDash([2 * dpr, 5 * dpr]);
      ctx.strokeStyle = "rgba(96,165,250,0.9)";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(xLeft, vaTopY);
      ctx.lineTo(xRight, vaTopY);
      ctx.stroke();
      ctx.setLineDash([]);
      _label(
        ctx,
        `VAH  ${_fmt(vaTopPrice)}`,
        xRight + 6 * dpr,
        vaTopY,
        "rgba(96,165,250,0.9)",
        dpr,
      );

      // ── VAL line ─────────────────────────────────────────────────────────
      ctx.setLineDash([2 * dpr, 5 * dpr]);
      ctx.strokeStyle = "rgba(96,165,250,0.9)";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(xLeft, vaBotY);
      ctx.lineTo(xRight, vaBotY);
      ctx.stroke();
      ctx.setLineDash([]);
      _label(
        ctx,
        `VAL  ${_fmt(vaBotPrice)}`,
        xRight + 6 * dpr,
        vaBotY,
        "rgba(96,165,250,0.9)",
        dpr,
      );

      // ── POC line ─────────────────────────────────────────────────────────
      const pocY = toY(pLo + (poc + 0.5) * step);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(xLeft, pocY);
      ctx.lineTo(xRight, pocY);
      ctx.stroke();
      ctx.setLineDash([]);
      _label(
        ctx,
        `POC  ${_fmt(pLo + (poc + 0.5) * step)}`,
        xRight + 6 * dpr,
        pocY,
        "#fbbf24",
        dpr,
      );

      // ── range boundary lines ─────────────────────────────────────────────
      ctx.strokeStyle = "rgba(251,191,36,0.35)";
      ctx.lineWidth = dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(xLeft, oy);
      ctx.lineTo(xLeft, oy + ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xRight, oy);
      ctx.lineTo(xRight, oy + ch);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case "long":
    case "short": {
      const isLong = tool === "long";
      const entry = p1;
      const target = p2;
      const stop =
        stopP ??
        (isLong
          ? entry - Math.abs(target - entry)
          : entry + Math.abs(target - entry));

      const xL = Math.min(x1, x2),
        xR = Math.max(x1, x2);
      const yEntry = toY(entry);
      const yTarget = toY(target);
      const yStop = toY(stop);

      const profitC = "rgba(38,166,154,0.15)";
      const profitS = "#26a69a";
      const lossC = "rgba(239,83,80,0.15)";
      const lossS = "#ef5350";

      ctx.fillStyle = profitC;
      ctx.fillRect(
        xL,
        Math.min(yEntry, yTarget),
        xR - xL,
        Math.abs(yTarget - yEntry),
      );
      ctx.strokeStyle = profitS;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(
        xL,
        Math.min(yEntry, yTarget),
        xR - xL,
        Math.abs(yTarget - yEntry),
      );

      ctx.fillStyle = lossC;
      ctx.fillRect(
        xL,
        Math.min(yEntry, yStop),
        xR - xL,
        Math.abs(yStop - yEntry),
      );
      ctx.strokeStyle = lossS;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(
        xL,
        Math.min(yEntry, yStop),
        xR - xL,
        Math.abs(yStop - yEntry),
      );

      ctx.strokeStyle = "#d1d5db";
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([5 * dpr, 3 * dpr]);
      ctx.beginPath();
      ctx.moveTo(xL, yEntry);
      ctx.lineTo(xR, yEntry);
      ctx.stroke();
      ctx.setLineDash([]);

      const profitDist = Math.abs(target - entry);
      const lossDist = Math.abs(stop - entry);
      const rr = lossDist > 0 ? (profitDist / lossDist).toFixed(1) : "∞";
      _label(ctx, `TP  ${_fmt(target)}`, xR + 8 * dpr, yTarget, profitS, dpr);
      _label(
        ctx,
        `Entry  ${_fmt(entry)}`,
        xR + 8 * dpr,
        yEntry,
        "#d1d5db",
        dpr,
      );
      _label(ctx, `SL  ${_fmt(stop)}`, xR + 8 * dpr, yStop, lossS, dpr);

      const midPY = (yEntry + yTarget) / 2;
      ctx.font = `bold ${9 * dpr}px "IBM Plex Mono"`;
      ctx.fillStyle = profitS;
      ctx.textAlign = "left";
      ctx.fillText(`R:R 1:${rr}`, xL + 8 * dpr, midPY + 4 * dpr);

      _tri(ctx, xL - 12 * dpr, yEntry, 7 * dpr, isLong ? -1 : 1, profitS);
      break;
    }
  }

  if (isSelected && !isPreview) {
    ctx.restore();
    ctx.save();

    const BODY_PAD = 12;
    let hbXMin = Math.min(c1.x, c2.x) - BODY_PAD;
    let hbXMax = Math.max(c1.x, c2.x) + BODY_PAD;
    let hbYMin = Math.min(c1.y, c2.y) - BODY_PAD;
    let hbYMax = Math.max(c1.y, c2.y) + BODY_PAD;
    if ((tool === "long" || tool === "short") && shape.stopP !== undefined) {
      const stopCss = dm._toCss(shape.t1, shape.stopP, layout);
      hbYMin = Math.min(hbYMin, stopCss.y - BODY_PAD);
      hbYMax = Math.max(hbYMax, stopCss.y + BODY_PAD);
    }
    const hbX = hbXMin * dpr,
      hbY = hbYMin * dpr;
    const hbW = (hbXMax - hbXMin) * dpr,
      hbH = (hbYMax - hbYMin) * dpr;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(hbX, hbY, hbW, hbH);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.strokeRect(hbX, hbY, hbW, hbH);
    ctx.setLineDash([]);

    const handles = dm._shapeHandles(shape, layout);
    for (const [key, h] of Object.entries(handles)) {
      let hColor = "#fff";
      if (key === "top") hColor = "#26a69a";
      if (key === "bot") hColor = "#ef5350";

      const hx = h.x * dpr,
        hy = h.y * dpr;
      ctx.beginPath();
      ctx.arc(hx, hy, 5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = hColor;
      ctx.fill();
      ctx.strokeStyle = "#0f1117";
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    const btn = dm._deleteBtnPos(shape, layout);
    if (btn) {
      const bx = btn.x * dpr,
        by = btn.y * dpr,
        br = 8 * dpr;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = "#374151";
      ctx.fill();
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.font = `bold ${10 * dpr}px sans-serif`;
      ctx.fillStyle = "#ef5350";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✕", bx, by);
      ctx.textBaseline = "alphabetic";
    }
  }

  ctx.restore();
}

function _clipLine(x1, y1, x2, y2, xMin, yMin, xMax, yMax) {
  const dx = x2 - x1,
    dy = y2 - y1;
  if (!dx && !dy) return null;
  let lo = -1e9,
    hi = 1e9;
  if (dx) {
    const a = (xMin - x1) / dx,
      b = (xMax - x1) / dx;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  } else if (x1 < xMin || x1 > xMax) return null;
  if (dy) {
    const a = (yMin - y1) / dy,
      b = (yMax - y1) / dy;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  } else if (y1 < yMin || y1 > yMax) return null;
  if (lo > hi) return null;
  return [x1 + lo * dx, y1 + lo * dy, x1 + hi * dx, y1 + hi * dy];
}

function _dot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function _tri(ctx, cx, cy, r, dir, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + dir * r);
  ctx.lineTo(cx - r, cy - dir * r * 0.6);
  ctx.lineTo(cx + r, cy - dir * r * 0.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function _label(ctx, text, x, y, color, dpr) {
  ctx.font = `${9 * dpr}px "IBM Plex Mono"`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.textBaseline = "alphabetic";
}

function _fmt(p) {
  if (!isFinite(p)) return "";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}
