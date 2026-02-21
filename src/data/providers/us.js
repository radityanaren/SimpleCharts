import { registerProvider } from "../api.js";
import SYMBOLS from "../symbols/us.json";

const TF_MAP = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "60m",
  "1D": "1d",
  "1W": "1wk",
};

registerProvider({
  id: "us",
  supportedTf: Object.keys(TF_MAP),

  match: (symbol) => !symbol.includes(".") && symbol === symbol.toUpperCase(),

  async fetchSymbols() {
    return SYMBOLS.map((s) => ({
      label: s,
      value: s,
      source: "us",
    }));
  },

  async fetchCandles(symbol, tf, limit = 300) {
    const interval = TF_MAP[tf] ?? "1d";

    const range =
      interval === "1m" || interval === "5m"
        ? "5d"
        : interval === "15m" || interval === "30m" || interval === "60m"
          ? "1mo"
          : "2y";

    const res = await fetch(
      `/yahoo/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
    );

    const json = await res.json();
    const r = json.chart.result?.[0];
    if (!r) return [];

    const t = r.timestamp;
    const q = r.indicators.quote[0];

    const candles = [];
    for (let i = 0; i < t.length; i++) {
      if (q.open[i] == null) continue;
      candles.push({
        time: t[i] * 1000,
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume[i],
      });
    }

    return candles.slice(-limit);
  },

  subscribeRealtime() {
    return () => {};
  },
});
