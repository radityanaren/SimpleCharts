const ZONE = { CHART: "chart", PRICE_AXIS: "price", TIME_AXIS: "time" };
const LINE_MODE_THRESHOLD = 3;

export class CandleChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.candles = [];

    this.viewStart = 0;
    this.viewCount = 120;
    this.priceLo = 0;
    this.priceHi = 1;

    this.padding = { top: 20, right: 70, bottom: 40, left: 12 };
    this._rightPad = 70;
    this._drag = null;
    this._mouse = null;
    this.onNeedMore = null;
    this._needMorePending = false;
    this.indicatorManager = null;
    this._drawingActive = false;

    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth || window.innerWidth;
    const h = p.clientHeight || window.innerHeight - 48;
    this.canvas.width = w * devicePixelRatio;
    this.canvas.height = h * devicePixelRatio;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.draw();
  }

  _maxViewCount() {
    return Math.max(10, this.candles.length + 20);
  }

  setCandles(candles) {
    this.candles = candles;
    const canvasW = this.canvas.width / devicePixelRatio;
    const chartW = Math.max(
      100,
      canvasW - this.padding.left - this.padding.right,
    );
    this.viewCount = Math.max(20, Math.floor(chartW / 8));
    this.viewStart = Math.max(
      0,
      candles.length - Math.round((this.viewCount * 2) / 3),
    );
    this._syncPriceToView();
    this.draw();
  }

  replaceCandles(candles) {
    if (!this.candles.length) {
      this.setCandles(candles);
      return;
    }

    const distFromRight =
      this.candles.length - (this.viewStart + this.viewCount);
    if (distFromRight <= 5) {
      this.candles = candles;
      this.viewStart = Math.max(
        0,
        candles.length - Math.round((this.viewCount * 2) / 3),
      );
      this._syncPriceToView();
      this.draw();
      return;
    }

    const centreFrac = 0.5;
    const centreIdx = Math.round(this.viewStart + centreFrac * this.viewCount);
    const clampedIdx = Math.max(
      0,
      Math.min(this.candles.length - 1, centreIdx),
    );
    const centreTime = this.candles[clampedIdx]?.time ?? 0;

    let nearestIdx = 0,
      nearestDist = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const dist = Math.abs(candles[i].time - centreTime);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    this.candles = candles;
    this.viewStart = nearestIdx - centreFrac * this.viewCount;
    this.viewStart = Math.max(-this.viewCount * 0.5, this.viewStart);
    this._syncPriceToView();
    this.draw();
  }

  prependCandles(candles) {
    if (!candles.length) return;
    const shift = candles.length;
    this.candles = [...candles, ...this.candles];
    this.viewStart += shift;
    this.draw();
  }

  autoFit() {
    this._syncPriceToView();
    this.draw();
  }

  goToLatest() {
    this.viewStart = Math.max(
      0,
      this.candles.length - Math.round((this.viewCount * 2) / 3),
    );
    this._syncPriceToView();
    this.draw();
  }

  _syncPriceToView() {
    const si = Math.max(0, Math.floor(this.viewStart));
    const ei = Math.min(
      this.candles.length,
      Math.ceil(this.viewStart + this.viewCount),
    );
    const slice = this.candles.slice(si, ei);
    if (!slice.length) return;
    let lo = Infinity,
      hi = -Infinity;
    for (const c of slice) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const pad = (hi - lo) * 0.08;
    this.priceLo = lo - pad;
    this.priceHi = hi + pad;
  }

  updateLast(candle) {
    if (!this.candles.length) return;
    const last = this.candles[this.candles.length - 1];
    if (last.time === candle.time) {
      this.candles[this.candles.length - 1] = { ...candle };
    } else if (candle.time > last.time) {
      this.candles.push({ ...candle });
      const distFromRight =
        this.candles.length - (this.viewStart + this.viewCount);
      if (distFromRight <= 3) this.viewStart++;
    }
    this.draw();
  }

  _chartDims() {
    const p = this.padding;
    const W = this.canvas.width / devicePixelRatio;
    const H = this.canvas.height / devicePixelRatio;
    return {
      W,
      H,
      chartW: W - p.left - p.right,
      chartH: H - p.top - p.bottom,
      ox: p.left,
      oy: p.top,
    };
  }

  _getZone(x, y) {
    const { W, H, chartH, oy } = this._chartDims();
    if (x > W - this.padding.right) return ZONE.PRICE_AXIS;
    if (y > oy + chartH) return ZONE.TIME_AXIS;
    return ZONE.CHART;
  }

  _clientXToIndex(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const { chartW } = this._chartDims();
    return (
      this.viewStart +
      ((clientX - rect.left - this.padding.left) / chartW) * this.viewCount
    );
  }

  _clientYToPrice(clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const { chartH } = this._chartDims();
    return (
      this.priceHi -
      ((clientY - rect.top - this.padding.top) / chartH) *
        (this.priceHi - this.priceLo)
    );
  }

  _triggerNeedMore() {
    if (this._needMorePending || !this.onNeedMore) return;
    if (this.viewStart < 20) {
      this._needMorePending = true;
      Promise.resolve().then(async () => {
        await this.onNeedMore();
        this._needMorePending = false;
      });
    }
  }

  draw() {
    const { ctx, canvas } = this;
    const p = this.padding;
    const dpr = devicePixelRatio;
    const W = canvas.width,
      H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!this.candles.length) return;
    const lo = this.priceLo,
      hi = this.priceHi;
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return;

    ctx.font = `${11 * dpr}px "IBM Plex Mono"`;
    const _axSample = formatPrice(hi);
    const _axMeasured = ctx.measureText(_axSample).width / dpr;
    const AXIS_W = Math.max(50, Math.ceil(_axMeasured) + 14);
    this.padding.right = AXIS_W;
    this._rightPad = AXIS_W;

    const chartW = (W / dpr - p.left - p.right) * dpr;
    const chartH = (H / dpr - p.top - p.bottom) * dpr;
    const ox = p.left * dpr,
      oy = p.top * dpr;
    if (chartW <= 0 || chartH <= 0) return;

    const toY = (price) => oy + chartH - ((price - lo) / (hi - lo)) * chartH;
    const candleW = chartW / this.viewCount;
    const toX = (idx) => ox + (idx - this.viewStart) * candleW;
    const useLineMode = candleW < LINE_MODE_THRESHOLD * dpr;

    ctx.font = `${11 * dpr}px "IBM Plex Mono"`;

    const priceRange = hi - lo;
    const rawStep = priceRange / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const niceStep = Math.ceil(rawStep / mag) * mag;
    const firstTick = Math.ceil(lo / niceStep) * niceStep;

    const si = Math.max(0, Math.floor(this.viewStart));
    const ei = Math.min(
      this.candles.length,
      Math.ceil(this.viewStart + this.viewCount),
    );
    const minLabelPx = 80 * dpr;
    const timeStep = Math.max(1, Math.ceil(minLabelPx / candleW));
    const firstLabelIdx = Math.ceil(si / timeStep) * timeStep;

    const timeStripY = H - 24 * dpr;
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b7280";
    ctx.font = `${10 * dpr}px "IBM Plex Mono"`;
    for (let i = firstLabelIdx; i < ei; i += timeStep) {
      const x = toX(i) + candleW / 2;
      if (x >= ox && x <= ox + chartW)
        ctx.fillText(
          formatTimeLabel(this.candles[i].time),
          x,
          timeStripY + 13 * dpr,
        );
    }

    ctx.font = `${11 * dpr}px "IBM Plex Mono"`;

    if (useLineMode) {
      ctx.beginPath();
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = dpr * 1.5;
      let first = true;
      for (let i = si; i < ei; i++) {
        const x = toX(i) + candleW / 2;
        const y = toY(this.candles[i].close);
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      const bodyW = Math.max(1, candleW * 0.6);
      for (let i = si; i < ei; i++) {
        const c = this.candles[i];
        const cx = toX(i) + candleW / 2;
        if (cx < ox - candleW || cx > ox + chartW + candleW) continue;
        const isUp = c.close >= c.open;
        const color = isUp ? "#26a69a" : "#ef5350";
        ctx.strokeStyle = color;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(cx, toY(c.high));
        ctx.lineTo(cx, toY(c.low));
        ctx.stroke();
        ctx.fillStyle = color;
        const by = toY(Math.max(c.open, c.close));
        const bh = Math.max(dpr, Math.abs(toY(c.open) - toY(c.close)));
        ctx.fillRect(cx - bodyW / 2, by, bodyW, bh);
      }
    }

    if (this.indicatorManager) {
      this.indicatorManager.drawAll(ctx);
    }

    const last = this.candles[this.candles.length - 1];
    const ly = toY(last.close);
    if (ly >= oy && ly <= oy + chartH) {
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(ox, ly);
      ctx.lineTo(ox + chartW, ly);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const axW = AXIS_W * dpr;
    const axX = W - axW;

    ctx.fillStyle = "#151821";
    ctx.fillRect(axX, 0, axW, H);

    ctx.font = `${11 * dpr}px "IBM Plex Mono"`;
    ctx.textAlign = "left";
    for (let price = firstTick; price < hi; price += niceStep) {
      const y = toY(price);
      if (y < oy || y > oy + chartH) continue;
      ctx.fillStyle = "#6b7280";
      ctx.fillText(formatPrice(price), axX + 6 * dpr, y + 4 * dpr);
    }

    const TAG_OVERHANG = 20 * dpr;
    const tagX = axX - TAG_OVERHANG;
    const tagW = axW + TAG_OVERHANG;
    if (ly >= oy && ly <= oy + chartH) {
      const isUp = last.close >= last.open;
      ctx.fillStyle = isUp ? "#26a69a" : "#ef5350";
      ctx.fillRect(tagX, ly - 11 * dpr, tagW, 22 * dpr);
      ctx.fillStyle = "#0f1117";
      ctx.textAlign = "center";
      ctx.font = `bold ${11 * dpr}px "IBM Plex Mono"`;
      ctx.fillText(formatPrice(last.close), tagX + tagW / 2, ly + 4 * dpr);
    } else {
      const isUp = last.close >= last.open;
      const arrowY = last.close > hi ? oy + 6 * dpr : oy + chartH - 6 * dpr;
      ctx.fillStyle = isUp ? "#26a69a" : "#ef5350";
      ctx.fillRect(tagX, arrowY - 11 * dpr, tagW, 22 * dpr);
      ctx.fillStyle = "#0f1117";
      ctx.textAlign = "center";
      ctx.font = `bold ${11 * dpr}px "IBM Plex Mono"`;
      ctx.fillText(formatPrice(last.close), tagX + tagW / 2, arrowY + 4 * dpr);
    }

    if (this._mouse) {
      const mx = this._mouse.x * dpr;
      const my = this._mouse.y * dpr;
      if (mx >= ox && mx <= ox + chartW && my >= oy && my <= oy + chartH) {
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.strokeStyle = "#4b5563";
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(mx, oy);
        ctx.lineTo(mx, oy + chartH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, my);
        ctx.lineTo(ox + chartW, my);
        ctx.stroke();
        ctx.setLineDash([]);

        const cursorPrice = this._clientYToPrice(
          this._mouse.y + this.canvas.getBoundingClientRect().top,
        );
        const priceLabel = formatPrice(cursorPrice);
        const cAxW = this.padding.right * dpr;
        const cAxX = W - cAxW;
        const cOvh = 20 * dpr;
        const cTagX = cAxX - cOvh;
        const cTagW = cAxW + cOvh;
        const cLabelH = 20 * dpr;
        ctx.fillStyle = "#374151";
        ctx.fillRect(cTagX, my - cLabelH / 2, cTagW, cLabelH);
        ctx.strokeStyle = "#4b5563";
        ctx.lineWidth = dpr;
        ctx.strokeRect(cTagX, my - cLabelH / 2, cTagW, cLabelH);
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.font = `${10 * dpr}px "IBM Plex Mono"`;
        ctx.fillText(priceLabel, cTagX + cTagW / 2, my + 4 * dpr);

        const cursorIdx =
          this.viewStart +
          ((this._mouse.x - this.padding.left) / this._chartDims().chartW) *
            this.viewCount;
        const clampedI = Math.max(
          0,
          Math.min(this.candles.length - 1, Math.round(cursorIdx)),
        );
        if (this.candles[clampedI]) {
          const timeLabel = formatFullDatetime(this.candles[clampedI].time);
          const labelW = (timeLabel.length * 6.5 + 16) * dpr;
          const labelX = Math.max(
            ox,
            Math.min(mx - labelW / 2, ox + chartW - labelW),
          );
          const tsY = H - 24 * dpr;
          ctx.fillStyle = "#374151";
          ctx.fillRect(labelX, tsY, labelW, 20 * dpr);
          ctx.strokeStyle = "#4b5563";
          ctx.lineWidth = dpr;
          ctx.strokeRect(labelX, tsY, labelW, 20 * dpr);
          ctx.fillStyle = "#e5e7eb";
          ctx.textAlign = "center";
          ctx.font = `${10 * dpr}px "IBM Plex Mono"`;
          ctx.fillText(timeLabel, labelX + labelW / 2, tsY + 13 * dpr);
        }
      }
    }
  }

  _bindEvents() {
    const el = this.canvas;

    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      this._mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.draw();
    });

    el.addEventListener("mouseleave", () => {
      this._mouse = null;
      this.draw();
    });

    el.addEventListener("mousedown", (e) => {
      if (this._drawingActive) return;
      if (e._dmConsumed) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left,
        y = e.clientY - rect.top;
      const zone = this._getZone(x, y);

      if (zone === ZONE.PRICE_AXIS) {
        const { chartH, oy } = this._chartDims();
        const last = this.candles[this.candles.length - 1];
        if (last) {
          const ly =
            oy +
            chartH -
            ((last.close - this.priceLo) / (this.priceHi - this.priceLo)) *
              chartH;
          // Tag may be at arrow position when price is off-screen
          const tagY =
            ly >= oy && ly <= oy + chartH
              ? ly
              : last.close > this.priceHi
                ? oy + 6
                : oy + chartH - 6;
          if (Math.abs(y - tagY) < 14) {
            this.goToLatest();
            return;
          }
        }
      }

      this._drag = {
        zone,
        startX: e.clientX,
        startY: e.clientY,
        startViewStart: this.viewStart,
        startViewCount: this.viewCount,
        startLo: this.priceLo,
        startHi: this.priceHi,
        anchorIdx: this.viewStart + this.viewCount / 2,
        anchorPrice: (this.priceLo + this.priceHi) / 2,
      };
      el.style.cursor =
        zone === ZONE.PRICE_AXIS
          ? "ns-resize"
          : zone === ZONE.TIME_AXIS
            ? "ew-resize"
            : "crosshair";
    });

    window.addEventListener("mousemove", (e) => {
      if (!this._drag) {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left,
          y = e.clientY - rect.top;
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          const z = this._getZone(x, y);
          el.style.cursor =
            z === ZONE.PRICE_AXIS
              ? "ns-resize"
              : z === ZONE.TIME_AXIS
                ? "ew-resize"
                : "crosshair";
        }
        return;
      }

      const dx = e.clientX - this._drag.startX;
      const dy = e.clientY - this._drag.startY;
      const { chartW, chartH } = this._chartDims();

      if (this._drag.zone === ZONE.CHART) {
        const dxCandles = (dx / chartW) * this._drag.startViewCount;
        const dyPrice =
          (dy / chartH) * (this._drag.startHi - this._drag.startLo);
        this.viewStart = this._drag.startViewStart - dxCandles;
        this.viewStart = Math.max(-this.viewCount * 0.5, this.viewStart);
        this.priceLo = this._drag.startLo + dyPrice;
        this.priceHi = this._drag.startHi + dyPrice;
        this._triggerNeedMore();
        this.draw();
      } else if (this._drag.zone === ZONE.TIME_AXIS) {
        const factor = Math.pow(1.005, -dx);
        const newCount = Math.max(
          10,
          Math.min(this._maxViewCount(), this._drag.startViewCount * factor),
        );
        this.viewCount = newCount;
        this.viewStart = this._drag.anchorIdx - newCount / 2;
        this.viewStart = Math.max(-this.viewCount * 0.5, this.viewStart);
        this._triggerNeedMore();
        this.draw();
      } else if (this._drag.zone === ZONE.PRICE_AXIS) {
        const factor = Math.pow(1.005, dy);
        const half = ((this._drag.startHi - this._drag.startLo) / 2) * factor;
        this.priceLo = this._drag.anchorPrice - half;
        this.priceHi = this._drag.anchorPrice + half;
        this.draw();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this._drag) {
        this._drag = null;
        el.style.cursor = "crosshair";
      }
    });

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const zone = this._getZone(e.clientX - rect.left, e.clientY - rect.top);
        const factor = e.deltaY > 0 ? 1.12 : 0.89;

        if (zone === ZONE.PRICE_AXIS) {
          const ap = this._clientYToPrice(e.clientY);
          const loFrac = (ap - this.priceLo) / (this.priceHi - this.priceLo);
          const hiFrac = (this.priceHi - ap) / (this.priceHi - this.priceLo);
          const range = (this.priceHi - this.priceLo) * factor;
          this.priceLo = ap - loFrac * range;
          this.priceHi = ap + hiFrac * range;
        } else if (zone === ZONE.TIME_AXIS) {
          const ai = this._clientXToIndex(e.clientX);
          const aFrac = (ai - this.viewStart) / this.viewCount;
          const newCount = Math.max(
            10,
            Math.min(this._maxViewCount(), this.viewCount * factor),
          );
          this.viewStart = ai - aFrac * newCount;
          this.viewStart = Math.max(-newCount * 0.5, this.viewStart);
          this.viewCount = newCount;
          this._triggerNeedMore();
        } else {
          const ai = this._clientXToIndex(e.clientX);
          const aFrac = (ai - this.viewStart) / this.viewCount;
          const ap = this._clientYToPrice(e.clientY);
          const loFrac = (ap - this.priceLo) / (this.priceHi - this.priceLo);
          const hiFrac = (this.priceHi - ap) / (this.priceHi - this.priceLo);
          const newCount = Math.max(
            10,
            Math.min(this._maxViewCount(), this.viewCount * factor),
          );
          this.viewStart = ai - aFrac * newCount;
          this.viewStart = Math.max(-newCount * 0.5, this.viewStart);
          this.viewCount = newCount;
          const range = (this.priceHi - this.priceLo) * factor;
          this.priceLo = ap - loFrac * range;
          this.priceHi = ap + hiFrac * range;
          this._triggerNeedMore();
        }
        this.draw();
      },
      { passive: false },
    );

    let lastTX = null,
      lastTY = null;
    el.addEventListener("touchstart", (e) => {
      lastTX = e.touches[0].clientX;
      lastTY = e.touches[0].clientY;
    });
    el.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        if (lastTX == null) return;
        const dx = e.touches[0].clientX - lastTX;
        const dy = e.touches[0].clientY - lastTY;
        lastTX = e.touches[0].clientX;
        lastTY = e.touches[0].clientY;
        const { chartW, chartH } = this._chartDims();
        this.viewStart -= (dx / chartW) * this.viewCount;
        this.viewStart = Math.max(-this.viewCount * 0.5, this.viewStart);
        this.priceLo += (dy / chartH) * (this.priceHi - this.priceLo);
        this.priceHi += (dy / chartH) * (this.priceHi - this.priceLo);
        this._triggerNeedMore();
        this.draw();
      },
      { passive: false },
    );
  }

  destroy() {
    this._resizeObserver.disconnect();
  }
}

function formatPrice(p) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function formatTimeLabel(ms) {
  const d = new Date(ms);
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  if (h === "00" && m === "00") return `${dd}/${mo}`;
  return `${h}:${m}`;
}

function formatFullDatetime(ms) {
  const d = new Date(ms);
  const yr = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${yr}-${mo}-${dd} ${h}:${m}`;
}
