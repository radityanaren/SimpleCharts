const PROVIDERS = [];

export function registerProvider(p) {
  PROVIDERS.push(p);
}

function getProvider(symbol) {
  return PROVIDERS.find((p) => p.match(symbol));
}

export async function loadAllSymbols(limitPerProvider = 100) {
  const all = [];
  for (const p of PROVIDERS) {
    const list = await p.fetchSymbols(limitPerProvider);
    all.push(...list);
  }
  return all;
}

export async function fetchCandles(symbol, tf, limit, endTime) {
  const p = getProvider(symbol);
  return p.fetchCandles(symbol, tf, limit, endTime);
}

export function subscribeRealtime(symbol, tf, cb) {
  const p = getProvider(symbol);
  return p.subscribeRealtime(symbol, tf, cb);
}

export function getSupportedTf(symbol) {
  const p = getProvider(symbol);
  if (!p || !p.supportedTf) return null;
  return p.supportedTf;
}
