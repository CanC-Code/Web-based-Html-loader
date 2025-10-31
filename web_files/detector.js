// detector.js — refined for better person cutout and automatic stop

const Detector = (function () {
  let ready = false;
  let mode = 'human';
  let seg = null;
  let lastSegMask = null;
  let segPendingResolve = null;

  async function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  async function ensureSelfieSeg() {
    if (seg) return;
    if (!window.SelfieSegmentation) {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    }
    seg = new SelfieSegmentation.SelfieSegmentation({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    seg.onResults(results => {
      if (!results || !results.segmentationMask) {
        lastSegMask = null;
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
        return;
      }
      createImageBitmap(results.segmentationMask).then(bitmap => {
        if (lastSegMask) try { lastSegMask.close(); } catch(e){}
        lastSegMask = bitmap;
        if (segPendingResolve) { segPendingResolve(bitmap); segPendingResolve = null; }
      }).catch(err => {
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
      });
    });
  }

  async function init(options = {}) {
    mode = options.mode || mode;
    if (mode === 'human') await ensureSelfieSeg();
    ready = true;
    return true;
  }

  async function runSegmentationOnFrame(imageData) {
    if (!seg) await ensureSelfieSeg();
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d').putImageData(imageData, 0, 0);

    return new Promise((resolve) => {
      segPendingResolve = resolve;
      seg.send({ image: tmp });
      setTimeout(() => {
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
        resolve(null);
      }, 750);
    });
  }

  async function processFrame(imageData, opts = {}) {
    if (!ready) return null;
    const requestedMode = opts.mode || mode;
    if (requestedMode === 'human') {
      try {
        const bitmap = await runSegmentationOnFrame(imageData);
        if (!bitmap) return null;
        return { type: 'bitmap', bitmap: bitmap };
      } catch (err) {
        console.warn('Segmentation failed', err);
        return null;
      }
    }
    return null; // for now only human mode supported
  }

  async function applyMask(ctx, mask) {
    if (!mask) return;
    try {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      if (mask.type === 'bitmap') {
        // create temporary canvas to hold mask
        const tmp = document.createElement('canvas');
        tmp.width = mask.bitmap.width;
        tmp.height = mask.bitmap.height;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(mask.bitmap, 0, 0);

        // Get mask ImageData
        const maskData = tctx.getImageData(0, 0, tmp.width, tmp.height);
        const frame = ctx.getImageData(0, 0, w, h);

        // Composite original frame with soft mask
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const maskI = (Math.floor(y * maskData.height / h) * maskData.width + Math.floor(x * maskData.width / w)) * 4;
            const alpha = maskData.data[maskI] / 255; // normalized
            frame.data[i] = frame.data[i];     // keep original R
            frame.data[i+1] = frame.data[i+1]; // keep original G
            frame.data[i+2] = frame.data[i+2]; // keep original B
            frame.data[i+3] = alpha * 255;      // apply mask
          }
        }
        ctx.putImageData(frame, 0, 0);

        try { mask.bitmap.close(); } catch(e){}
      }
    } catch (err) {
      console.error('applyMask error', err);
    }
  }

  return {
    init,
    processFrame,
    applyMask,
    _internal: { isReady: () => ready }
  };
})();