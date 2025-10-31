// detector.js
let Detector = (() => {
  let selfieSeg = null;
  let worker = null;
  let ready = false;
  let mode = "person";

  async function init(opts = {}) {
    mode = opts.mode || "person";
    if (mode === "person") {
      if (typeof SelfieSegmentation === "undefined") {
        await importScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");
      }
      selfieSeg = new SelfieSegmentation({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
      });
      selfieSeg.setOptions({ modelSelection: 1 });
      ready = true;
      console.log("[Detector] SelfieSegmentation initialized");
    } else {
      worker = new Worker("detector-worker.js");
      worker.onmessage = (e) => console.log("[Worker]", e.data.msg || e.data.type);
      ready = true;
      console.log("[Detector] OpenCV Worker ready");
    }
  }

  function importScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function processFrame(frame) {
    if (!ready) return null;

    if (mode === "person" && selfieSeg) {
      return new Promise((resolve) => {
        selfieSeg.onResults((results) => {
          resolve(results.segmentationMask);
        });
        selfieSeg.send({ image: frame });
      });
    } else if (worker) {
      return new Promise((resolve) => {
        worker.onmessage = (e) => {
          if (e.data.type === "mask") {
            const { maskData, width, height } = e.data;
            const maskImageData = new ImageData(
              new Uint8ClampedArray(maskData), width, height
            );
            resolve(maskImageData);
          }
        };
        worker.postMessage({ type: "process", frame, mode });
      });
    }
    return null;
  }

  function applyMask(ctx, mask) {
    if (!mask) return;
    const tmp = document.createElement("canvas");
    tmp.width = ctx.canvas.width;
    tmp.height = ctx.canvas.height;
    const tctx = tmp.getContext("2d");

    if (mask instanceof HTMLCanvasElement) {
      tctx.drawImage(mask, 0, 0, tmp.width, tmp.height);
    } else {
      tctx.putImageData(mask, 0, 0);
    }

    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  return { init, processFrame, applyMask };
})();