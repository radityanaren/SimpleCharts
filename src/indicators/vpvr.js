import { Indicator } from "./base.js";

const BINS = 300;

export class VPVR extends Indicator {
  constructor(opts = {}) {
    super("vpvr");
    this.barMaxWidthPx = opts.barMaxWidthPx ?? 120;
    this.valueAreaPct = opts.valueAreaPct ?? 0.7;
    this.colorPOC = opts.colorPOC ?? "#f59e0b";
    this.colorVAH = opts.colorVAH ?? "rgba(96,165,250,0.9)";
    this.colorVAL = opts.colorVAL ?? "rgba(96,165,250,0.9)";
    this._cache = null;
  }

  invalidate() {
    this._cache = null;
  }

  _compute(candles, si, ei, priceLo, priceHi) {
    if (
      this._cache &&
      this._cache.si === si &&
      this._cache.ei === ei &&
      this._cache.priceLo === priceLo &&
      this._cache.priceHi === priceHi
    )
      return this._cache;

    const range = priceHi - priceLo;
    if (range <= 0) return null;

    const buyBins = new Float64Array(BINS);
    const sellBins = new Float64Array(BINS);
    const step = range / BINS;

    for (let i = si; i < ei; i++) {
      const c = candles[i];
      const vol = c.volume ?? 0;
      if (vol === 0) continue;

      const cLo = Math.max(c.low, priceLo);
      const cHi = Math.min(c.high, priceHi);
      if (cHi <= cLo) continue;

      const bLo = Math.max(0, Math.floor((cLo - priceLo) / step));
      const bHi = Math.min(BINS - 1, Math.floor((cHi - priceLo) / step));
      const span = bHi - bLo + 1;
      const each = vol / span;
      const isBuy = c.close >= c.open;

      for (let b = bLo; b <= bHi; b++) {
        if (isBuy) buyBins[b] += each;
        else sellBins[b] += each;
      }
    }

    // ── POC ──────────────────────────────────────────────────────────────────
    let pocBin = 0;
    for (let b = 1; b < BINS; b++) {
      if (buyBins[b] + sellBins[b] > buyBins[pocBin] + sellBins[pocBin])
        pocBin = b;
    }

    // ── Value Area (70 %) ─────────────────────────────────────────────────────
    const totalVol = Array.from(buyBins).reduce(
      (a, v, i) => a + v + sellBins[i],
      0,
    );
    const vaTarget = totalVol * this.valueAreaPct;
    let vaSum = buyBins[pocBin] + sellBins[pocBin];
    let vaLo = pocBin,
      vaHi = pocBin;

    while (vaSum < vaTarget && (vaLo > 0 || vaHi < BINS - 1)) {
      const addUp =
        vaHi < BINS - 1 ? buyBins[vaHi + 1] + sellBins[vaHi + 1] : 0;
      const addDown = vaLo > 0 ? buyBins[vaLo - 1] + sellBins[vaLo - 1] : 0;
      if (addUp >= addDown) {
        vaHi++;
        vaSum += addUp;
      } else {
        vaLo--;
        vaSum += addDown;
      }
    }

    const result = {
      si,
      ei,
      priceLo,
      priceHi,
      buyBins,
      sellBins,
      pocBin,
      vaLo,
      vaHi,
    };
    this._cache = result;
    return result;
  }

  draw(ctx, layout, candles) {
    const {
      dpr,
      chartOx,
      chartOy,
      chartW,
      chartH,
      priceLo,
      priceHi,
      si,
      ei,
      toY,
    } = layout;

    if (!candles.length || ei <= si) return;

    const data = this._compute(candles, si, ei, priceLo, priceHi);
    if (!data) return;

    const { buyBins, sellBins, pocBin, vaLo, vaHi } = data;
    const range = priceHi - priceLo;
    const step = range / BINS;
    const maxBarW = this.barMaxWidthPx * dpr;
    const binH = chartH / BINS;

    // ── max total for normalisation ───────────────────────────────────────────
    let maxTotal = 0;
    for (let b = 0; b < BINS; b++) {
      const t = buyBins[b] + sellBins[b];
      if (t > maxTotal) maxTotal = t;
    }
    if (maxTotal === 0) return;

    // ── draw bars ─────────────────────────────────────────────────────────────
    for (let b = 0; b < BINS; b++) {
      const total = buyBins[b] + sellBins[b];
      if (total === 0) continue;

      const bPrice = priceLo + b * step;
      const y = toY(bPrice + step);
      const h = Math.max(1, binH - 0.5);

      const totalW = (total / maxTotal) * maxBarW;
      const buyW = (buyBins[b] / total) * totalW;
      const sellW = totalW - buyW;

      const inVA = b >= vaLo && b <= vaHi;

      // buy (green) segment
      const buyAlpha = inVA ? 0.7 : 0.32;
      ctx.fillStyle = `rgba(38,166,154,${buyAlpha})`;
      ctx.fillRect(chartOx, y, buyW, h);

      // sell (red) segment
      const sellAlpha = inVA ? 0.7 : 0.32;
      ctx.fillStyle = `rgba(239,83,80,${sellAlpha})`;
      ctx.fillRect(chartOx + buyW, y, sellW, h);
    }

    // ── Value Area outline box ────────────────────────────────────────────────
    const vaTopPrice = priceLo + vaHi * step + step;
    const vaBotPrice = priceLo + vaLo * step;
    const vaTopY = toY(vaTopPrice);
    const vaBotY = toY(vaBotPrice);

    // Find max bar width inside value area to set outline width
    let vaMaxW = 0;
    for (let b = vaLo; b <= vaHi; b++) {
      const total = buyBins[b] + sellBins[b];
      const w = (total / maxTotal) * maxBarW;
      if (w > vaMaxW) vaMaxW = w;
    }

    ctx.save();
    ctx.setLineDash([3 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(96,165,250,0.35)";
    ctx.lineWidth = dpr;
    ctx.strokeRect(chartOx, vaTopY, vaMaxW, vaBotY - vaTopY);
    ctx.setLineDash([]);
    ctx.restore();

    // ── VAH line ─────────────────────────────────────────────────────────────
    const vahY = toY(vaTopPrice);
    if (vahY >= chartOy && vahY <= chartOy + chartH) {
      ctx.setLineDash([2 * dpr, 5 * dpr]);
      ctx.strokeStyle = this.colorVAH;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(chartOx, vahY);
      ctx.lineTo(chartOx + chartW, vahY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${9 * dpr}px "IBM Plex Mono"`;
      ctx.fillStyle = this.colorVAH;
      ctx.textAlign = "left";
      ctx.fillText(
        `VAH  ${fmtPrice(vaTopPrice)}`,
        chartOx + 4 * dpr,
        vahY - 3 * dpr,
      );
    }

    // ── VAL line ─────────────────────────────────────────────────────────────
    const valY = toY(vaBotPrice);
    if (valY >= chartOy && valY <= chartOy + chartH) {
      ctx.setLineDash([2 * dpr, 5 * dpr]);
      ctx.strokeStyle = this.colorVAL;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(chartOx, valY);
      ctx.lineTo(chartOx + chartW, valY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${9 * dpr}px "IBM Plex Mono"`;
      ctx.fillStyle = this.colorVAL;
      ctx.textAlign = "left";
      ctx.fillText(
        `VAL  ${fmtPrice(vaBotPrice)}`,
        chartOx + 4 * dpr,
        valY + 11 * dpr,
      );
    }

    // ── POC line ─────────────────────────────────────────────────────────────
    const pocPrice = priceLo + pocBin * step + step / 2;
    const pocY = toY(pocPrice);
    const pocTotalW =
      ((buyBins[pocBin] + sellBins[pocBin]) / maxTotal) * maxBarW;

    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.strokeStyle = this.colorPOC;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(chartOx, pocY);
    ctx.lineTo(chartOx + chartW, pocY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `bold ${9 * dpr}px "IBM Plex Mono"`;
    ctx.fillStyle = this.colorPOC;
    ctx.textAlign = "left";
    ctx.fillText(
      `POC  ${fmtPrice(pocPrice)}`,
      chartOx + pocTotalW + 6 * dpr,
      pocY - 3 * dpr,
    );
  }
}

function fmtPrice(p) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}
