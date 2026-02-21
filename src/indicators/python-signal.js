/**
 * python-signal.js — Draws Python AI/ML output on the chart.
 *
 * Reads from each candle:
 *   _lines  : { "SMA 20": 49800.5, "SMA 50": 49600.1 }  → lines on chart
 *   _meta   : { "SMA 20": "#f59e0b", "SMA 50": "#3b82f6" } → line colours
 *   _signal : "buy" | "sell"  → arrow markers on candles
 *   _confidence : 0.0–1.0     → arrow opacity
 *
 * Silent on non-Python symbols. Already registered in main.js.
 * You never need to edit this file — all changes go in python/server.py.
 */

import { Indicator } from "./base.js";

export class PythonSignal extends Indicator {
  constructor() {
    super("python-signal");
  }

  invalidate() {}   // nothing to reset — we read live from candles each frame

  draw(ctx, layout, candles) {
    const { si, ei, toX, toY, dpr } = layout;
    if (!candles.length) return;

    const end = Math.min(ei, candles.length);

    // Bail out if this isn't a Python symbol
    if (!candles.slice(si, end).some((c) => c._lines)) return;

    // Grab colour map from the first candle that has it
    const meta = candles.slice(si, end).find((c) => c._meta)?._meta ?? {};

    // Collect all line names visible in this window
    const lineNames = new Set();
    for (let i = si; i < end; i++) {
      if (candles[i]._lines)
        Object.keys(candles[i]._lines).forEach((k) => lineNames.add(k));
    }

    const fallback = ["#f59e0b","#3b82f6","#a78bfa","#26a69a","#ef5350"];
    let fi = 0;

    // ── Lines ─────────────────────────────────────────────────────────────
    for (const name of lineNames) {
      const color = meta[name] ?? fallback[fi++ % fallback.length];

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5 * dpr;
      ctx.lineJoin    = "round";
      ctx.beginPath();

      let started = false;
      for (let i = si; i < end; i++) {
        const val = candles[i]._lines?.[name];
        if (val == null || !isFinite(val)) { started = false; continue; }
        const x = toX(i), y = toY(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else            ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Label at rightmost valid point
      for (let i = end - 1; i >= si; i--) {
        const val = candles[i]._lines?.[name];
        if (val == null || !isFinite(val)) continue;
        ctx.font         = `${9 * dpr}px "IBM Plex Mono"`;
        ctx.fillStyle    = color;
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(name, toX(i) + 6 * dpr, toY(val));
        ctx.textBaseline = "alphabetic";
        break;
      }
      ctx.restore();
    }

    // ── Arrow markers ─────────────────────────────────────────────────────
    for (let i = si; i < end; i++) {
      const c = candles[i];
      if (!c._signal) continue;

      const isBuy  = c._signal === "buy";
      const alpha  = 0.4 + 0.6 * Math.min(1, c._confidence ?? 1);
      const color  = isBuy
        ? `rgba(38,166,154,${alpha})`
        : `rgba(239,83,80,${alpha})`;

      const x      = toX(i);
      const r      = 7 * dpr;
      const dir    = isBuy ? 1 : -1;
      const anchor = toY(isBuy ? c.low : c.high);
      const tipY   = anchor + dir * r * 2.2;

      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x,     tipY - dir * r * 1.4);  // tip  (toward candle)
      ctx.lineTo(x - r, tipY + dir * r * 0.7);  // base left
      ctx.lineTo(x + r, tipY + dir * r * 0.7);  // base right
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
