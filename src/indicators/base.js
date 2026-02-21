export class Indicator {
  constructor(id) {
    this.id = id;
    this.enabled = true;
  }

  init() {}
  draw(_ctx, _layout, _candles) {}
  invalidate() {}
  destroy() {}
}
