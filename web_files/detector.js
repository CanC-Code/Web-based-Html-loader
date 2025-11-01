// detector.js
let Detector = {
  worker: null,
  ready: false,
  maskCallback: null,

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
          // create ImageData for canvas
          let maskImg;
          if (msg.maskData instanceof Uint8ClampedArray) {
            maskImg = new ImageData(new Uint8ClampedArray(msg.maskData), msg.width, msg.height);
          } else {
            // MediaPipe returns HTMLImageElement/Canvas
            maskImg = msg.maskData;
          }
          this.maskCallback(maskImg);
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
    // mask can be ImageData or Canvas
    if (mask instanceof ImageData) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = mask.width; tempCanvas.height = mask.height;
      tempCanvas.getContext("2d").putImageData(mask, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    } else {
      // assume HTMLImageElement / Canvas
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }
};