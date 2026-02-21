"""
────────────────────────────────────────────────────────────────────────────
HOW TO ADD YOUR OWN STRATEGY:

  1. Add an entry to STRATEGIES
  2. Add a branch in _run_strategy()
  3. Add columns to the DataFrame:
       - Any normal column  → becomes a line on the chart
       - "_signal" column   → "buy" / "sell" / None  → arrow markers
       - "_confidence"      → 0.0–1.0  → controls arrow opacity (optional)

────────────────────────────────────────────────────────────────────────────
"""

import asyncio
import json
import time
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="SimpleCharts Python Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── 1. Your strategies ────────────────────────────────────────────────────────

STRATEGIES = [
    {"label": "RSI Strategy", "value": "PY:rsi", "source": "python"},
]

# ── 2. Data source (replace with real data) ───────────────────────────────────


def _fetch_ohlcv(tf: str, limit: int, end_ms: Optional[int]) -> pd.DataFrame:
    """
    Stub — synthetic data. Replace with yfinance, ccxt, CSV, etc.

    yfinance example:
        import yfinance as yf
        tf_map = {"1m":"1m","5m":"5m","15m":"15m","30m":"30m",
                  "1H":"1h","4H":"1h","1D":"1d","1W":"1wk","1M":"1mo"}
        df = yf.download("BTC-USD", period="60d",
                         interval=tf_map.get(tf,"1h"), auto_adjust=True)
        df.columns = ["open","high","low","close","volume"]
        df["time"] = df.index.astype(int) // 1_000_000
        return df.tail(limit).reset_index(drop=True)
    """
    ms = {
        "1m": 60_000,
        "5m": 300_000,
        "15m": 900_000,
        "30m": 1_800_000,
        "1H": 3_600_000,
        "4H": 14_400_000,
        "1D": 86_400_000,
        "1W": 604_800_000,
        "1M": 2_592_000_000,
    }.get(tf, 3_600_000)
    now = end_ms or int(time.time() * 1000)
    t = [now - (limit - 1 - i) * ms for i in range(limit)]
    base = 50_000.0
    p = base + base * 0.05 * np.sin(np.linspace(0, 4 * np.pi, limit))
    o = p
    c = p * (1 + 0.002 * np.random.randn(limit))
    h = np.maximum(o, c) * (1 + 0.003 * np.abs(np.random.randn(limit)))
    lo = np.minimum(o, c) * (1 - 0.003 * np.abs(np.random.randn(limit)))
    v = np.abs(1000 + 200 * np.random.randn(limit))
    return pd.DataFrame(
        {"time": t, "open": o, "high": h, "low": lo, "close": c, "volume": v}
    )


# ── 3. Strategy logic ─────────────────────────────────────────────────────────


def _run_strategy(df: pd.DataFrame, name: str) -> pd.DataFrame:
    df = df.copy()

    if name == "rsi":
        # Moving averages — these become lines on the chart
        df["SMA 20"] = df["close"].rolling(20).mean()
        df["SMA 50"] = df["close"].rolling(50).mean()

        # RSI
        delta = df["close"].diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rsi = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))

        # Buy/sell signals — these become arrows on the chart
        sig = [None] * len(df)
        conf = [0.5] * len(df)
        for i in range(1, len(df)):
            if rsi.iloc[i - 1] < 30 and rsi.iloc[i] >= 30:
                sig[i] = "buy"
                conf[i] = round(float(1 - rsi.iloc[i] / 100), 3)
            elif rsi.iloc[i - 1] > 70 and rsi.iloc[i] <= 70:
                sig[i] = "sell"
                conf[i] = round(float(rsi.iloc[i] / 100), 3)
        df["_signal"] = sig
        df["_confidence"] = conf

    # Add more strategies here:
    # elif name == "mymodel":
    #     df["SMA 20"] = df["close"].rolling(20).mean()
    #     df["_signal"] = ...

    return df


# ── 4. Response builder ───────────────────────────────────────────────────────

_COLORS = ["#f59e0b", "#3b82f6", "#a78bfa", "#26a69a", "#ef5350"]
_SKIP = {"time", "open", "high", "low", "close", "volume", "_signal", "_confidence"}


def _build(df: pd.DataFrame) -> list[dict]:
    line_cols = [c for c in df.columns if c not in _SKIP]
    meta = {c: _COLORS[i % len(_COLORS)] for i, c in enumerate(line_cols)}

    out = []
    for _, row in df.iterrows():
        c = {
            "time": int(row["time"]),
            "open": round(float(row["open"]), 4),
            "high": round(float(row["high"]), 4),
            "low": round(float(row["low"]), 4),
            "close": round(float(row["close"]), 4),
            "volume": round(float(row["volume"]), 4),
            # Lines: { "SMA 20": 49800.5, "SMA 50": null, ... }
            "_lines": {
                k: (
                    None
                    if (v is None or (isinstance(v, float) and np.isnan(v)))
                    else round(float(v), 4)
                )
                for k, v in row.items()
                if k in line_cols
            },
            # Colour map on every candle so JS never misses it
            "_meta": meta,
        }
        sig = row.get("_signal")
        if sig in ("buy", "sell"):
            c["_signal"] = sig
            c["_confidence"] = float(row.get("_confidence", 1.0))
        out.append(c)
    return out


# ── 5. Endpoints ──────────────────────────────────────────────────────────────


@app.get("/symbols")
def symbols():
    return STRATEGIES


@app.get("/candles")
def candles(
    symbol: str,
    tf: str = "1H",
    limit: int = 500,
    endTime: Optional[int] = Query(default=None),
):
    df = _fetch_ohlcv(tf, limit, endTime)
    df = _run_strategy(df, symbol.removeprefix("PY:"))
    return _build(df)


@app.get("/subscribe")
async def subscribe(symbol: str, tf: str = "1H"):
    secs = {"1m": 60, "5m": 300, "15m": 900, "1H": 3600}.get(tf, 3600)

    async def stream():
        while True:
            await asyncio.sleep(secs)
            df = _fetch_ohlcv(tf, 2, int(time.time() * 1000))
            df = _run_strategy(df, symbol.removeprefix("PY:"))
            candle = _build(df)[-1]
            yield f"data: {json.dumps(candle)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
