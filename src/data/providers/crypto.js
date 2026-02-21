import { registerProvider } from "../api.js";
import SYMBOLS from "../symbols/crypto.json";

const REST = "https://api.binance.com";
const WS = "wss://stream.binance.com:9443/ws";

const TF_MAP = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

registerProvider({
  id: "crypto",
  supportedTf: Object.keys(TF_MAP),

  match: (s) => s.endsWith("USDT"),

  async fetchSymbols() {
    return SYMBOLS.map((s) => ({
      label: s,
      value: s,
      source: "crypto",
    }));
  },

  async fetchCandles(symbol, tf, limit = 500, endTime) {
    const url = new URL(`${REST}/api/v3/klines`);
    url.search = new URLSearchParams({
      symbol,
      interval: TF_MAP[tf],
      limit,
      ...(endTime ? { endTime } : {}),
    });

    const res = await fetch(url);
    const data = await res.json();

    return data.map((k) => ({
      time: k[0],
      open: +k[1],
      high: +k[2],
      low: +k[3],
      close: +k[4],
      volume: +k[5],
    }));
  },

  subscribeRealtime(symbol, tf, cb) {
    const ws = new WebSocket(
      `${WS}/${symbol.toLowerCase()}@kline_${TF_MAP[tf]}`,
    );

    ws.onmessage = (e) => {
      const k = JSON.parse(e.data).k;
      cb({
        time: k.t,
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
      });
    };

    return () => ws.close();
  },
});
