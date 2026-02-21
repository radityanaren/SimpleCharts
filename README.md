# SimpleCharts

> Zero dependency, canvas rendered financial charting, built entirely from scratch.

SimpleCharts is a fast browser based trading chart that renders everything on a raw HTML5 Canvas. It can load  Historical data as well as streams live market data from WebSockets/SSE, supports multiple asset classes, and ships a fully modular system so you can plug in any data source, indicator, or Python strategy you want.

![SimpleCharts preview](https://raw.githubusercontent.com/radityanaren/SimpleCharts/main/assets/preview.png)

## Features

- **Candlestick chart** : smooth zoom, pan, and autofit.
- **Realtime updates** : live price streaming via WebSocket/SSE.
- **Multi-market** : Easy to add providers (now it includes free Binance and Yahoo Finance API).
- **Timeframes** : 1m, 5m, 15m, 30m, 1H, 4H, 1D, 1W, 1M (unsupported TFs are hidden automatically).
- **Dynamic Volume Profile (VPVR)** : instant auto dynamically change 300 bin buy/sell coloured histogram.
- **Volume MA** : coloured volume bars + moving average overlay in a dedicated sub-pane
- **Big Trade markers** : bubble overlays on candles where large notional trades occurred (aggTrades, non aggTrades)
- **Drawing tools** :
  - **Trend Line**
  - **Rectangle** 
  - **Fibonacci Retracement**
  - **VP Range (VPFR)**
  - **Long / Short Position**
- **Modular provider system** : drop a single `.js` file into `src/data/providers/`
- **Modular indicator system** : extend the `Indicator` base class and register it in `main.js`
- **Python backend** : line overlays and buy/sell arrow markers render directly on the chart

## Tech Stack

| Layer | Tech |
|---|---|
| Rendering | HTML5 Canvas 2D |
| Realtime data | Native WebSocket / SSE |
| Build / dev server | [Vite](https://vitejs.dev/) |
| Runtime dependencies | - |
| Dev dependencies | Vite only |
| Python backend (optional) | FastAPI + uvicorn |

## Known Bug :
> [!IMPORTANT]
> This is a list of a bug(will be fixed)
* **Drawn tools** : Drawn tools are easy to get dragged and moved.
* **Not saved** : Drawn tools are stored in memory only, they will be lost on page refresh.
---

## Getting Started
> [!WARNING]
> Make sure you have **Git** and **Node.js 18+** installed!

1. Clone the repo:
   ```bash
   git clone https://github.com/radityanaren/SimpleCharts.git
   ```

2. Go to the directory:
   ```bash
   cd SimpleCharts
   ```

3. Install dev dependencies :
   ```bash
   npm install
   ```
5. Install Python dependencies(optional) : 
   ```bash
   pip install fastapi uvicorn pandas numpy
   ```
6. Run Python server(optional) : 
   ```bash
   uvicorn python.server:app --reload --port 8000
   ```
7. Start the dev server:
   ```bash
   npm run dev
   ```
8. Open **http://localhost:5173** in your browser.
> [!NOTE]
> If you see `ECONNREFUSED` errors in the Vite console, it means the Python server isn't running.

## How to Use it
SimpleCharts use a different zoom system than TradingView

### Navigation

| Action | Input |
|---|---|
| Move | Click mouse and move around |
| Zoom in / out | Scroll wheel |
| Horizontal and vertical zoom | Click and drag on the time or price |
| Current price | Click on the realtime price on the price axis |
| Reset view | Click the **⤢** auto-fit button (bottom-right) |

---

## Adding a Custom Data Provider, New Indicator or Strategy

### A. Custom Data Provider

Providers live in `src/data/providers/`. Any `.js` file placed there is **auto discovered** by Vite. The search badge label and colour are derived automatically from the `source` field.

```js
// src/data/providers/myprovider.js
import { registerProvider } from "../api.js";

registerProvider({
  id: "myprovider",
  supportedTf: ["1m", "5m", "1H", "1D"],
  match: (symbol) => symbol.startsWith("MY:"),

  async fetchSymbols(limit) {
    return [{ label: "My Asset", value: "MY:MYASSET", source: "myprovider" }];
  },

  async fetchCandles(symbol, tf, limit = 500, endTime) {
    const data = await myApi.getCandles(symbol, tf, limit, endTime);
    return data.map((c) => ({
      time: c.timestamp, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v,
    }));
  },

  subscribeRealtime(symbol, tf, callback) {
    const ws = new WebSocket(`wss://myapi.example.com/stream/${symbol}/${tf}`);
    ws.onmessage = (e) => {
      const k = JSON.parse(e.data);
      callback({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c, volume: k.v });
    };
    return () => ws.close();
  },
});
```

Restart `npm run dev`, your symbols appear in the search dropdown immediately.


### B. JavaScript Indicator

Create a file in `src/indicators/`, extend `Indicator`, register it in `main.js`.

```js
// src/indicators/my-indicator.js
import { Indicator } from "./base.js";

export class MyIndicator extends Indicator {
  constructor(opts = {}) {
    super("my-indicator");   // unique id
    this.period = opts.period ?? 20;
  }

  // Reset cached state when the symbol changes
  invalidate() { this._cache = null; }

  // Called every frame
  draw(ctx, layout, candles) {
    const { toX, toY, si, ei, dpr } = layout;

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth   = 1.5 * dpr;
    ctx.beginPath();

    let started = false;
    for (let i = si + this.period; i < ei; i++) {
      let sum = 0;
      for (let k = i - this.period + 1; k <= i; k++) sum += candles[k].close;
      const ma = sum / this.period;
      const x  = toX(i), y = toY(ma);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else            ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
```

add a static symbol list on `src/data/symbols` as a .JSON file, example :

```json
// src/data/symbols/symbol-list.json
[
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT"
]
```

Register in `src/main.js`:

```js
import { MyIndicator } from "./indicators/my-indicator.js";
// inside init(), after indicatorManager is created:
indicatorManager.add(new MyIndicator({ period: 20 }));
```

#### Layout object reference

| Property | Type | Description |
|---|---|---|
| `dpr` | number | `devicePixelRatio`, multiply all pixel sizes by this |
| `chartOx / chartOy` | number | Top left corner of the price pane in raw canvas px |
| `chartW / chartH` | number | Width / height of the price pane in raw canvas px |
| `toX(index)` | function | Candle index → raw canvas X |
| `toY(price)` | function | Price → raw canvas Y |
| `si / ei` | number | Visible candle range: `candles[si..ei]` |
| `priceLo / priceHi` | number | Current visible price range |
| `volOx / volOy / volW / volH` | number | Volume sub-pane dimensions |
| `toVolY(vol, maxVol)` | function | Volume value → raw canvas Y in volume pane |
| `candleW` | number | Width of one candle in raw canvas px |

---

### C. Python Strategy
> [!NOTE]
>search `PY:rsi` in the chart to see the demo strategy

The Python side lives entirely in `python/server.py`. The JS side (`python-signal.js`) is already wired up.

Open `python/server.py`. There are only two things to do:

**1. Add an entry to `STRATEGIES`:**
```python
STRATEGIES = [
    {"label": "RSI Strategy",    "value": "PY:rsi",      "source": "python"},
    {"label": "My LSTM Model",   "value": "PY:lstm",     "source": "python"},  # ← add
]
```

**2. Add a branch in `_run_strategy()`:**
```python
elif name == "lstm":
    # Load your model and run inference
    import pickle
    model = pickle.load(open("models/lstm.pkl", "rb"))
    probs = model.predict(df[["open","high","low","close","volume"]])

    # Any column you add → becomes a line drawn on the chart
    df["Prediction"] = probs * df["close"]

    # "_signal" column → buy/sell arrow markers on candles
    df["_signal"]     = ["buy" if p > 0.65 else "sell" if p < 0.35 else None for p in probs]
    df["_confidence"] = probs   # 0–1, controls arrow opacity
```

The chart picks up the new strategy immediately after restarting uvicorn.

**3. Replacing the fake sine-wave data**

The default `_fetch_ohlcv` generates synthetic data. Replace it with your real source:

```python
# yfinance example
import yfinance as yf

def _fetch_ohlcv(tf, limit, end_ms):
    tf_map = {"1m":"1m","5m":"5m","15m":"15m","30m":"30m",
              "1H":"1h","4H":"1h","1D":"1d","1W":"1wk","1M":"1mo"}
    df = yf.download("BTC-USD", period="60d",
                     interval=tf_map.get(tf,"1h"), auto_adjust=True)
    df.columns = ["open","high","low","close","volume"]
    df["time"] = df.index.astype(int) // 1_000_000
    return df.tail(limit).reset_index(drop=True)
```

#### What renders on the chart

| Column type | What it does |
|---|---|
| Any named column (`"SMA 20"`, `"Prediction"`, …) | Drawn as a coloured line with a label |
| `"_signal"` = `"buy"` / `"sell"` / `None` | Teal arrow (↑) or red arrow (↓) on the candle |
| `"_confidence"` = `0.0 - 1.0` | Controls arrow opacity (optional) |

---

## Contribute 

Feel free to contribute, pull request, or even address issues to this project.

---
