import { registerProvider } from "../api.js";
import SYMBOLS from "../symbols/idx.json";

const TF_MAP = {
  "1D": "1d",
  "1W": "1wk",
  "1M": "1mo",
};

registerProvider({
  id: "idx",
  supportedTf: Object.keys(TF_MAP),

  match: (s) => s.endsWith(".JK"),

  async fetchSymbols() {
    return SYMBOLS.map((s) => ({
      label: s.replace(".JK", ""),
      value: s,
      source: "idx",
    }));
  },

  async fetchCandles(symbol, tf, limit = 300) {
    const interval = TF_MAP[tf] || "1d";

    const res = await fetch(
      `/yahoo/v8/finance/chart/${symbol}?interval=${interval}&range=2y`,
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
