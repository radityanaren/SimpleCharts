export class IndicatorManager {
  constructor(chart) {
    this._chart = chart;
    this._indicators = [];
    this._lastLayout = null;
    this.drawingManager = null;
    this.volHeightPx = 0;
  }

  add(indicator) {
    this._indicators.push(indicator);
    indicator.init?.();
    if (indicator.id === "volume-ma") {
      this.volHeightPx = indicator.volHeightPx;
      this._chart.padding.bottom = this.volHeightPx + 40;
    }
    return this;
  }

  remove(id) {
    const idx = this._indicators.findIndex((i) => i.id === id);
    if (idx !== -1) {
      this._indicators[idx].destroy?.();
      this._indicators.splice(idx, 1);
    }
    if (id === "volume-ma") {
      this.volHeightPx = 0;
      this._chart.padding.bottom = 40;
    }
  }

  onSymbolChange(symbolValue, source) {
    for (const ind of this._indicators) {
      ind.invalidate?.();
      ind.setSymbol?.(symbolValue, source);
    }
  }

  drawAll(ctx) {
    const chart = this._chart;
    if (!chart.candles.length) return;

    const dpr = devicePixelRatio;
    const p = chart.padding;
    const W = chart.canvas.width / dpr;
    const H = chart.canvas.height / dpr;

    const timeAxisH = 40;
    const chartOx = p.left;
    const chartOy = p.top;
    const chartW = W - p.left - p.right;
    const chartH = H - p.top - timeAxisH - this.volHeightPx;
    const volOx = p.left;
    const volOy = chartOy + chartH;
    const volW = chartW;
    const volH = this.volHeightPx;

    if (chartH <= 0 || chartW <= 0) return;

    const priceLo = chart.priceLo;
    const priceHi = chart.priceHi;
    const candleW = (chartW * dpr) / chart.viewCount;

    const toY = (price) =>
      (chartOy + chartH - ((price - priceLo) / (priceHi - priceLo)) * chartH) *
      dpr;
    const toX = (idx) =>
      (chartOx + (idx - chart.viewStart) * (chartW / chart.viewCount)) * dpr;

    const si = Math.max(0, Math.floor(chart.viewStart));
    const ei = Math.min(
      chart.candles.length,
      Math.ceil(chart.viewStart + chart.viewCount),
    );

    const layout = {
      dpr,
      W: W * dpr,
      H: H * dpr,
      chartOx: chartOx * dpr,
      chartOy: chartOy * dpr,
      chartW: chartW * dpr,
      chartH: chartH * dpr,
      volOx: volOx * dpr,
      volOy: volOy * dpr,
      volW: volW * dpr,
      volH: volH * dpr,
      priceLo,
      priceHi,
      viewStart: chart.viewStart,
      viewCount: chart.viewCount,
      si,
      ei,
      toX,
      toY,
      candleW,
      toVolY: (vol, maxVol) => {
        if (!maxVol) return volOy * dpr;
        return (volOy + volH - (vol / maxVol) * volH) * dpr;
      },
      _candles: chart.candles,
    };

    this._lastLayout = layout;

    for (const ind of this._indicators) {
      if (!ind.enabled) continue;
      ctx.save();
      try {
        ind.draw(ctx, layout, chart.candles);
      } catch (e) {
        console.error(`[${ind.id}] draw error:`, e);
      }
      ctx.restore();
    }

    if (this.drawingManager) {
      ctx.save();
      try {
        this.drawingManager.drawAll(ctx, layout);
      } catch (e) {
        console.error("[drawing] draw error:", e);
      }
      ctx.restore();
    }
  }
}
