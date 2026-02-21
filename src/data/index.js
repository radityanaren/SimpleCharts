const providerModules = import.meta.glob("./providers/*.js", { eager: true });
void providerModules;

import {
  loadAllSymbols,
  fetchCandles,
  subscribeRealtime,
  getSupportedTf,
} from "./api.js";

export const ALL_SYMBOLS = [];

export async function loadSymbols(limit = 50) {
  ALL_SYMBOLS.length = 0;
  const list = await loadAllSymbols(limit);
  ALL_SYMBOLS.push(...list);
}

export { fetchCandles, subscribeRealtime, getSupportedTf };
