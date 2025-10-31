// detector.js — Stable MediaPipe integration for video_layer.html
const Detector = (function () {
  let seg = null;
  let mask = null;
  let canvasTmp = null;
  let ctxTmp = null;
  let ready = false;
  let processing = false;

  async function init(options = {}) {
    if (typeof SelfieSegmentation === "undefined") {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    seg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    seg.setOptions({ modelSelection: 1 });

    seg.onResults(r => {
      mask = r.segmentationMask || null;
      processing = false;
    });

    canvasTmp = document.createElement("canvas");
    ctxTmp = canvasTmp.getContext("2d");
    ready = true;
    console.log("[Detector] Initialized successfully");
    return true;
  }

  async function processFrame(frame, opts = {}) {
    if (!ready || !seg) return null;
    if (processing) return mask;
    processing = true;

    // draw frame into an offscreen canvas
    canvasTmp.width = frame.width;
    canvasTmp.height = frame.height;
    ctxTmp.putImageData(frame, 0, 0);

    try {
      await seg.send({ image: canvasTmp });
    } catch (err) {
      console.error("[Detector] processFrame error:", err);
      processing = false;
    }

    return mask;
  }

  function applyMask(ctx, mask) {
    if (!mask) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Draw original frame first
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(mask, 0, 0, w, h);

    // Clip out background — use destination-in to keep people only
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, w, h);
    ctx.restore();

    // Optionally: soften edges slightly
    // (disabled for now to keep it fast)
  }

  return { init, processFrame, applyMask };
})();