/**
 *
 *   GET /symbols
 *       → [{ "label": "RSI Strategy", "value": "PY:my_rsi_strategy" }, …]
 *
 *   GET /candles?symbol=PY:my_rsi_strategy&tf=1H&limit=500&endTime=<ms>
 *       → [{ "time": <ms>, "open", "high", "low", "close", "volume" }, …]
 *
 *   GET /subscribe?symbol=PY:my_rsi_strategy&tf=1H
 *       → Server-Sent Events stream, each event is a JSON candle object
 *         (use  EventSource  on the client side; the provider handles this)
 *         If your strategy is not real-time, this endpoint can just keep the
 *         connection open and send nothing — the provider will still work fine.
 */

import { registerProvider } from "../api.js";

const BASE = "/pybackend";

registerProvider({
  id: "python",

  supportedTf: ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"],

  match(symbol) {
    return typeof symbol === "string" && symbol.startsWith("PY:");
  },

  async fetchSymbols(_limit) {
    try {
      const res = await fetch(`${BASE}/symbols`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      return list.map((s) => ({ source: "python", ...s }));
    } catch (err) {
      console.warn("[python provider] fetchSymbols failed:", err.message);
      return [];
    }
  },

  /**
   * Fetch OHLCV candles from the Python backend.
   * @param {string} symbol   e.g. "PY:my_rsi_strategy"
   * @param {string} tf       e.g. "1H"
   * @param {number} limit    max candles to return
   * @param {number|null} endTime   ms timestamp — load candles *before* this
   */
  async fetchCandles(symbol, tf, limit = 500, endTime = null) {
    const params = new URLSearchParams({ symbol, tf, limit });
    if (endTime != null) params.set("endTime", endTime);

    const res = await fetch(`${BASE}/candles?${params}`);
    if (!res.ok) throw new Error(`[python] fetchCandles HTTP ${res.status}`);
    const data = await res.json();

    return data.map((c) => ({
      time: c.time > 1e12 ? c.time : c.time * 1000,
      open: +c.open,
      high: +c.high,
      low: +c.low,
      close: +c.close,
      volume: +(c.volume ?? 0),
      _lines: c._lines ?? null,
      _meta: c._meta ?? null,
      _signal: c._signal ?? null,
      _confidence: c._confidence ?? null,
    }));
  },

  /**
   * Subscribe to live (or simulated-live) candle updates via SSE.
   * Returns an unsubscribe function.
   */
  subscribeRealtime(symbol, tf, callback) {
    const params = new URLSearchParams({ symbol, tf });
    const url = `${BASE}/subscribe?${params}`;
    const es = new EventSource(url);

    es.onmessage = (ev) => {
      try {
        const c = JSON.parse(ev.data);
        callback({
          time: c.time > 1e12 ? c.time : c.time * 1000,
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
          volume: +(c.volume ?? 0),
          _lines: c._lines ?? null,
          _meta: c._meta ?? null,
          _signal: c._signal ?? null,
          _confidence: c._confidence ?? null,
        });
      } catch (err) {
        console.warn("[python provider] SSE parse error:", err);
      }
    };

    es.onerror = (err) => {
      console.warn("[python provider] SSE connection error:", err);
    };

    return () => es.close();
  },
});
