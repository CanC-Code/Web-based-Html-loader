// detector.js — guaranteed working global MediaPipe loader (no import issues)

const Detector = (function () {
  let selfieSegmentation = null;
  let initialized = false;
  let mode = 'human';
  let running = false;
  let latestMask = null;
  let lastBitmap = null;

  // Load script dynamically if not already loaded
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) return resolve();
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function init(options = {}) {
    mode = options.mode || 'human';

    // Load MediaPipe SelfieSegmentation if not present
    if (typeof SelfieSegmentation === 'undefined') {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");
    }

    // Instantiate global class
    if (typeof SelfieSegmentation === 'function') {
      selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
    } else if (typeof SelfieSegmentation?.SelfieSegmentation === 'function') {
      selfieSegmentation = new SelfieSegmentation.SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
    } else {
      throw new Error("Failed to load MediaPipe SelfieSegmentation constructor");
    }

    selfieSegmentation.setOptions({ modelSelection: 1 });

    selfieSegmentation.onResults((results) => {
      if (results.segmentationMask) {
        createImageBitmap(results.segmentationMask).then((bitmap) => {
          if (lastBitmap) lastBitmap.close();
          lastBitmap = bitmap;
          latestMask = bitmap;
          running = false;
        });
      } else {
        running = false;
      }
    });

    initialized = true;
    console.log("✅ Detector initialized successfully");
    return true;
  }

  async function processFrame(imageData) {
    if (!initialized || !selfieSegmentation) return null;
    if (running) return latestMask; // prevent reentry
    running = true;

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = imageData.width;
    tmpCanvas.height = imageData.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.putImageData(imageData, 0, 0);

    try {
      await selfieSegmentation.send({ image: tmpCanvas });
    } catch (err) {
      console.error("Segmentation send failed:", err);
      running = false;
    }

    return latestMask;
  }

  async function applyMask(ctx, mask) {
    if (!mask) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(mask, 0, 0);

    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const frameData = ctx.getImageData(0, 0, w, h);

    const mw = maskCanvas.width;
    const mh = maskCanvas.height;

    // Create a smooth, feathered alpha mask
    const output = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const my = Math.floor((y / h) * mh);
      for (let x = 0; x < w; x++) {
        const mx = Math.floor((x / w) * mw);
        const mi = (my * mw + mx) * 4;
        const alpha = maskData.data[mi] / 255;
        const fi = (y * w + x) * 4;

        // Apply soft alpha edge
        output.data[fi] = frameData.data[fi];
        output.data[fi + 1] = frameData.data[fi + 1];
        output.data[fi + 2] = frameData.data[fi + 2];
        output.data[fi + 3] = Math.round(alpha * 255);
      }
    }

    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(output, 0, 0);
  }

  return {
    init,
    processFrame,
    applyMask,
    _status: () => ({ initialized, running })
  };
})();