// detector.js — interface to detector-worker.js
class Detector {
  constructor() {
    this.worker = null;
    this.ready = false;
  }

  async init({ mode = "remove" } = {}) {
    if (this.ready) return;
    this.worker = new Worker("detector-worker.js");
    this.mode = mode;

    this.worker.onmessage = (e) => {
      const { type, msg } = e.data;
      if (type === "log") console.log("[Detector]", msg);
    };

    this.ready = true;
  }

  async processFrame(frame, { mode } = {}) {
    if (!this.ready) throw new Error("Detector not initialized");
    const ctx = new OffscreenCanvas(frame.width, frame.height).getContext("2d");
    ctx.putImageData(frame, 0, 0);
    const bitmap = ctx.canvas.transferToImageBitmap();

    return new Promise((resolve) => {
      const listener = (e) => {
        if (e.data.type === "mask") {
          resolve(new ImageData(
            new Uint8ClampedArray(e.data.maskData),
            e.data.width,
            e.data.height
          ));
          this.worker.removeEventListener("message", listener);
        }
      };
      this.worker.addEventListener("message", listener);
      this.worker.postMessage({ type: "process", frame: bitmap, mode: mode || this.mode }, [bitmap]);
    });
  }

  applyMask(ctx, mask) {
    if (!mask) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.putImageData(mask, 0, 0);
    ctx.restore();
  }
}

window.Detector = new Detector();