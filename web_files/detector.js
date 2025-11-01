// detector.js
let Detector = {
  worker: null,
  ready: false,
  maskCallback: null,
  mode: "human",

  async init({ mode="human" }={}) {
    if (!window.Worker) throw new Error("Web Workers not supported");
    if (this.worker) this.worker.terminate();

    this.worker = new Worker("detector-worker.js");
    this.mode = mode;

    return new Promise((resolve, reject) => {
      this.worker.onmessage = e => {
        const msg = e.data;
        if (msg.type === "log") console.log("[detector]", msg.msg);

        if (msg.type === "mask" && this.maskCallback) {
          this.maskCallback(msg.maskData);
        }

        if (!this.ready) { this.ready = true; resolve(); }
      };
      this.worker.onerror = err => reject(err);
    });
  },

  async processFrame(frame, options={}) {
    if (!this.ready) throw new Error("Detector not ready");
    return new Promise((resolve, reject) => {
      this.maskCallback = mask => resolve(mask);
      this.worker.postMessage({
        type: "process",
        frame: frame,
        mode: options.mode || this.mode
      });
    });
  },

  applyMask(ctx, mask) {
    if (!mask) return;

    // blur mode: composite human over blurred background
    if (this.mode === "blur") {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;

      // step 1: draw original frame blurred
      ctx.save();
      ctx.filter = "blur(12px)";
      ctx.drawImage(ctx.canvas, 0, 0, w, h);
      ctx.restore();

      // step 2: overlay human using mask
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, w, h);
      ctx.restore();

      // step 3: overlay original human over blurred background
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(ctx.canvas, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }
};