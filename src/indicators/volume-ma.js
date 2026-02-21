import { Indicator } from "./base.js";

export class VolumeMA extends Indicator {
  constructor(opts = {}) {
    super("volume-ma");
    this.maPeriods = opts.maPeriods ?? [20];
    this.maColors = opts.maColors ?? ["#f59e0b"];
    this.volHeightPx = opts.volHeightPx ?? 80;
  }

  draw(ctx, layout, candles) {
    const { dpr, volOx, volOy, volW, volH, candleW, toX, si, ei } = layout;

    if (!candles.length || volH <= 0) return;

    let maxVol = 0;
    for (let i = si; i < ei; i++) {
      if ((candles[i].volume ?? 0) > maxVol) maxVol = candles[i].volume;
    }
    if (maxVol === 0) return;

    const toVolY = (vol) => volOy + volH - (vol / maxVol) * volH;

    ctx.fillStyle = "#1e2435";
    ctx.fillRect(volOx, volOy, volW, dpr);

    const barW = Math.max(1, candleW * 0.8);
    for (let i = si; i < ei; i++) {
      const c = candles[i];
      const cx = toX(i) + candleW / 2;
      if (cx < volOx - candleW || cx > volOx + volW + candleW) continue;
      const isUp = c.close >= c.open;
      ctx.fillStyle = isUp ? "rgba(38,166,154,0.55)" : "rgba(239,83,80,0.55)";
      const y = toVolY(c.volume ?? 0);
      const bh = volOy + volH - y;
      if (bh > 0) ctx.fillRect(cx - barW / 2, y, barW, bh);
    }

    for (let pi = 0; pi < this.maPeriods.length; pi++) {
      const period = this.maPeriods[pi];
      const color = this.maColors[pi] ?? "#888";

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr * 1.5;
      ctx.setLineDash([]);
      let started = false;

      for (let i = si; i < ei; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let k = i - period + 1; k <= i; k++) sum += candles[k].volume ?? 0;
        const maVol = sum / period;
        const x = toX(i) + candleW / 2;
        const y = toVolY(maVol);
        if (y < volOy || y > volOy + volH) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      const last = ei - 1;
      if (last >= period - 1) {
        let sum = 0;
        for (let k = last - period + 1; k <= last; k++)
          sum += candles[k].volume ?? 0;
        const maVol = sum / period;
        const y = toVolY(maVol);
        if (y >= volOy && y <= volOy + volH) {
          ctx.font = `${9 * dpr}px "IBM Plex Mono"`;
          ctx.fillStyle = color;
          ctx.textAlign = "left";
          ctx.fillText(`VOL MA${period}`, volOx + 4 * dpr, y - 3 * dpr);
        }
      }
    }

    ctx.font = `${9 * dpr}px "IBM Plex Mono"`;
    ctx.fillStyle = "#4b5563";
    ctx.textAlign = "right";
    ctx.fillText(fmtVol(maxVol), volOx + volW - 4 * dpr, volOy + 10 * dpr);
  }
}

function fmtVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(0);
}
