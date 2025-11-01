// detector.js
class Detector {
  constructor() {
    this.worker = new Worker("detector-worker.js");
    this.ready = false;
    this.queue = [];
    this.worker.onmessage = e => {
      const { type, mask, width, height, mode } = e.data;
      if(type === "ready") { this.ready = true; }
      if(type === "frameResult") {
        const callback = this.queue.shift();
        if(callback) callback(mask, width, height, mode);
      }
    };
    this.worker.postMessage({ type: "init" });
  }

  processFrame(frame, width, height, mode) {
    return new Promise(resolve => {
      this.queue.push(resolve);
      this.worker.postMessage({ type: "process", frame, width, height, mode });
    });
  }

  applyMask(ctx, mask, width, height, mode) {
    if(!mask) return;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    maskCtx.drawImage(mask, 0, 0, width, height);

    if(mode === "remove") {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0, width, height);
    } else if(mode === "blur") {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.filter = "blur(10px)";
      ctx.drawImage(maskCanvas, 0, 0, width, height);
      ctx.filter = "none";
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// Singleton instance
const DetectorInstance = new Detector();