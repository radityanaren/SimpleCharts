import { Indicator } from "./base.js";

export class BigTrades extends Indicator {
  constructor(opts = {}) {
    super("big-trades");
    this.minUsdSize = opts.minUsdSize ?? 50_000;
    this.maxMarkers = opts.maxMarkers ?? 4000;
    this.yahooVolMultiplier = opts.yahooVolMultiplier ?? 3;
    this.yahooAvgPeriod = opts.yahooAvgPeriod ?? 20;

    this._trades = [];
    this._ws = null;
    this._isCrypto = false;
    this._candleInterval = 0;
  }

  setSymbol(symbol, source) {
    this._isCrypto = source === "crypto";
    this._trades = [];
    this._closeWS();
    if (this._isCrypto) {
      this._fetchHistorical(symbol);
      this._openWS(symbol);
    }
  }

  updateTimeMap(candles) {
    if (candles.length >= 2) {
      this._candleInterval = candles[1].time - candles[0].time;
    }
  }

  invalidate() {
    if (!this._isCrypto) this._trades = [];
  }
  destroy() {
    this._closeWS();
  }

  async _fetchHistorical(symbol) {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/aggTrades?symbol=${symbol}&limit=1000`,
      );
      const data = await res.json();
      if (!Array.isArray(data)) return;
      for (const t of data) {
        const notional = +t.q * +t.p;
        if (notional < this.minUsdSize) continue;
        this._add({ time: t.T, price: +t.p, notional, isSell: t.m });
      }
    } catch (_) {}
  }

  _openWS(symbol) {
    this._ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`,
    );
    this._ws.onmessage = (e) => {
      const t = JSON.parse(e.data);
      const notional = +t.q * +t.p;
      if (notional < this.minUsdSize) return;
      this._add({ time: t.T, price: +t.p, notional, isSell: t.m });
    };
    this._ws.onerror = () => {};
  }

  _closeWS() {
    if (this._ws) {
      try {
        this._ws.close();
      } catch (_) {}
      this._ws = null;
    }
  }

  _add(trade) {
    this._trades.push(trade);
    if (this._trades.length > this.maxMarkers) this._trades.shift();
  }

  _tradeIdx(time, candles, si, ei) {
    if (!this._candleInterval) return -1;
    const first = candles[si]?.time ?? 0;
    const idx = Math.round((time - first) / this._candleInterval) + si;
    return idx >= si && idx < ei ? idx : -1;
  }

  _yahooMarkers(candles, si, ei) {
    const out = [],
      P = this.yahooAvgPeriod;
    for (let i = si; i < ei; i++) {
      if (i < P) continue;
      let avg = 0;
      for (let k = i - P; k < i; k++) avg += candles[k].volume ?? 0;
      avg /= P;
      const vol = candles[i].volume ?? 0;
      if (avg > 0 && vol > avg * this.yahooVolMultiplier) {
        out.push({
          idx: i,
          isSell: candles[i].close < candles[i].open,
          mult: vol / avg,
        });
      }
    }
    return out;
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
      toX,
      toY,
      candleW,
      si,
      ei,
    } = layout;
    if (!candles.length) return;

    if (this._isCrypto) {
      if (!this._trades.length) return;

      // Aggregate into per-candle buckets
      const buckets = new Map(); // idx → { buy, sell }
      for (const t of this._trades) {
        if (t.price < priceLo || t.price > priceHi) continue;
        const idx = this._tradeIdx(t.time, candles, si, ei);
        if (idx < 0) continue;
        let b = buckets.get(idx);
        if (!b) {
          b = { buy: 0, sell: 0 };
          buckets.set(idx, b);
        }
        if (t.isSell) b.sell += t.notional;
        else b.buy += t.notional;
      }

      for (const [idx, b] of buckets) {
        const c = candles[idx];
        const cx = toX(idx) + candleW / 2;

        if (b.buy >= this.minUsdSize) {
          _bubble(ctx, cx, toY(c.high), b.buy, false, dpr);
        }
        if (b.sell >= this.minUsdSize) {
          _bubble(ctx, cx, toY(c.low), b.sell, true, dpr);
        }
      }
    } else {
      for (const m of this._yahooMarkers(candles, si, ei)) {
        const c = candles[m.idx];
        const cx = toX(m.idx) + candleW / 2;
        const vol = c.volume ?? 0;
        const notional = vol * c.close;
        const py = m.isSell ? toY(c.low) : toY(c.high);
        _bubble(ctx, cx, py, notional, m.isSell, dpr);
      }
    }
  }
}

function _bubble(ctx, cx, cy, notional, isSell, dpr) {
  const BASE = 50_000;
  const scale = Math.log10(Math.max(1, notional / BASE));
  const r = Math.max(5, Math.min(30, scale * 8)) * dpr;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);

  // Fill: semi-transparent (more transparent than reference image)
  ctx.fillStyle = isSell
    ? "rgba(239, 83, 80, 0.28)"
    : "rgba(76, 175, 80, 0.28)";
  ctx.fill();

  // Thin border for definition
  ctx.strokeStyle = isSell
    ? "rgba(239, 83, 80, 0.55)"
    : "rgba(76, 175, 80, 0.55)";
  ctx.lineWidth = dpr;
  ctx.stroke();
}
