// detector.js — bridge between main thread and worker
class Detector {
  static worker = null;
  static ready = false;

  static async init() {
    if (this.worker) return;
    this.worker = new Worker("detector-worker.js");
    this.worker.onmessage = e => {
      const { type, maskData, width, height, msg } = e.data;
      if (type === "log") console.log("[Worker]", msg);
      else if (type === "mask") {
        if (Detector.onMask) {
          const arr = new Uint8ClampedArray(maskData);
          Detector.onMask({ data: arr, width, height });
        }
      } else if (type === "error") console.error("[Worker]", msg);
    };
    return new Promise(resolve => {
      const checkReady = msg => {
        if (msg.type === "log" && msg.msg === "Detector ready") {
          Detector.ready = true;
          resolve();
        }
      };
      this.worker.onmessage = e => {
        checkReady(e.data);
        // always forward mask/error
        if (Detector.onMask) Detector.onMask(e.data);
      };
    });
  }

  static processFrame(frame, mode = "remove") {
    if (!this.worker || !this.ready) return;
    this.worker.postMessage({ type: "process", frame, mode });
  }

  static applyMask(ctx, maskObj, mode = "remove") {
    if (!maskObj) return;
    const { data, width, height } = maskObj;
    const mask = new ImageData(data, width, height);

    // draw original frame
    ctx.globalCompositeOperation = "source-over";

    if (mode === "remove") {
      ctx.globalCompositeOperation = "destination-in"; // keep only human
    } else if (mode === "blur") {
      ctx.globalCompositeOperation = "destination-in";
    }

    ctx.putImageData(mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}