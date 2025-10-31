// detector.js — robust MediaPipe loader + person cutout + safe processing
// Exposes: Detector.init(options), Detector.processFrame(imageData, opts), Detector.applyMask(ctx, mask)

const Detector = (function () {
  let ready = false;
  let mode = 'human';
  let seg = null;
  let lastSegBitmap = null;
  let segPendingResolve = null;
  let loadingSeg = false;

  // load a normal script by URL (non-module)
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  // Try to load MediaPipe SelfieSegmentation robustly:
  // 1) If global SelfieSegmentation exists and is a function/constructor, use it.
  // 2) Otherwise dynamic-import the module and use the exported SelfieSegmentation class.
  async function ensureSelfieSeg() {
    if (seg) return;
    if (loadingSeg) {
      // wait until loaded
      await new Promise(r => {
        const check = () => (seg ? r() : setTimeout(check, 50));
        check();
      });
      return;
    }
    loadingSeg = true;

    try {
      // If global constructor is available and looks like a class/constructor, use it.
      if (typeof window !== 'undefined' && typeof window.SelfieSegmentation === 'function') {
        // The global may be the constructor itself
        seg = new window.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
      } else if (typeof window !== 'undefined' && window.SelfieSegmentation && typeof window.SelfieSegmentation.SelfieSegmentation === 'function') {
        // Some builds expose namespace object
        seg = new window.SelfieSegmentation.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
      } else {
        // Try to import the module dynamically (works for ESM CDN)
        // This returns a module namespace with exported SelfieSegmentation
        const moduleUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
        try {
          const mod = await import(moduleUrl);
          if (mod && typeof mod.SelfieSegmentation === 'function') {
            seg = new mod.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
          } else if (mod && mod.default && typeof mod.default === 'function') {
            seg = new mod.default({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
          } else {
            // fallback: try loading the non-module script which may populate globals
            await loadScript(moduleUrl);
            if (typeof window !== 'undefined' && typeof window.SelfieSegmentation === 'function') {
              seg = new window.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
            } else if (window.SelfieSegmentation && typeof window.SelfieSegmentation.SelfieSegmentation === 'function') {
              seg = new window.SelfieSegmentation.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
            } else {
              throw new Error('SelfieSegmentation constructor not found after module import and script load.');
            }
          }
        } catch (modErr) {
          // final fallback, attempt to load script tag and hope globals are set
          const scriptUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
          await loadScript(scriptUrl);
          if (typeof window !== 'undefined' && typeof window.SelfieSegmentation === 'function') {
            seg = new window.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
          } else if (window.SelfieSegmentation && typeof window.SelfieSegmentation.SelfieSegmentation === 'function') {
            seg = new window.SelfieSegmentation.SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
          } else {
            throw modErr;
          }
        }
      }

      // If we reach here we have seg
      seg.setOptions?.({ modelSelection: 1 });
      seg.onResults(results => {
        if (!results || !results.segmentationMask) {
          // no mask returned
          if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
          // clear last
          if (lastSegBitmap) { try { lastSegBitmap.close(); } catch(e){} lastSegBitmap = null; }
          return;
        }
        // Create ImageBitmap for the segmentationMask and resolve pending
        createImageBitmap(results.segmentationMask).then(bitmap => {
          if (lastSegBitmap) {
            try { lastSegBitmap.close(); } catch (e) {}
          }
          lastSegBitmap = bitmap;
          if (segPendingResolve) {
            segPendingResolve(bitmap);
            segPendingResolve = null;
          }
        }).catch(err => {
          if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
          console.warn('createImageBitmap error for segmentationMask:', err);
        });
      });

    } finally {
      loadingSeg = false;
    }
  }

  // init API — sets mode and prepares segmentation if needed
  async function init(options = {}) {
    mode = options.mode || mode;
    if (mode === 'human') {
      await ensureSelfieSeg();
    }
    ready = true;
    return true;
  }

  // Run segmentation: draw ImageData to temp canvas and call seg.send, awaiting its onResults via promise
  async function runSegmentationOnFrame(imageData) {
    if (!seg) await ensureSelfieSeg();
    if (!seg) return null;

    // Draw imageData to temporary canvas that seg can accept
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d').putImageData(imageData, 0, 0);

    // Return a promise that resolves when onResults has set lastSegBitmap
    const p = new Promise((resolve) => {
      segPendingResolve = resolve;
      try {
        seg.send({ image: tmp });
      } catch (err) {
        // Some builds expect {image: tmp}, others require different usage — we already attempted robust loading
        // If seg.send throws, just resolve null after a short timeout
        console.warn('seg.send threw:', err);
        segPendingResolve = null;
        resolve(null);
        return;
      }
      // safety fallback: resolve null after timeout
      setTimeout(() => {
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
        resolve(null);
      }, 900);
    });

    return await p;
  }

  // Convert ImageBitmap (segmentation mask) into ImageData mask (alpha map)
  function bitmapToMaskImageData(bitmap) {
    if (!bitmap) return null;
    const tmp = document.createElement('canvas');
    tmp.width = bitmap.width;
    tmp.height = bitmap.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(bitmap, 0, 0);
    const id = tctx.getImageData(0, 0, tmp.width, tmp.height);
    const w = id.width, h = id.height;
    const out = new ImageData(w, h);
    // Make alpha from mask brightness or alpha channel, keep white rgb
    for (let i = 0, j = 0; i < id.data.length; i += 4, j += 4) {
      const r = id.data[i], g = id.data[i+1], b = id.data[i+2], a = id.data[i+3];
      let alpha = 0;
      if (a !== 0) alpha = a;
      else {
        const lum = (r + g + b) / 3;
        alpha = lum > 128 ? 255 : 0;
      }
      out.data[j] = 255;
      out.data[j+1] = 255;
      out.data[j+2] = 255;
      out.data[j+3] = alpha;
    }
    return out;
  }

  // Public processFrame: supports only 'human' mode here (other modes could be added)
  // Returns mask object: { type:'imageData', data: ImageData } or null
  async function processFrame(imageData, opts = {}) {
    if (!ready) {
      // try to initialise minimal
      try {
        if ((opts.mode || mode) === 'human') await ensureSelfieSeg();
        ready = true;
      } catch (err) {
        console.warn('Detector not ready and failed to init:', err);
        return null;
      }
    }

    const requestedMode = opts.mode || mode;

    if (requestedMode === 'human') {
      try {
        const bmp = await runSegmentationOnFrame(imageData);
        if (!bmp) return null;
        // convert to ImageData mask (alpha map)
        const maskData = bitmapToMaskImageData(bmp);
        // close bitmap now that we extracted data
        try { bmp.close(); } catch(e){}
        return { type: 'imageData', data: maskData };
      } catch (err) {
        console.warn('processFrame (human) failed:', err);
        return null;
      }
    }

    // Fallback: not supported in this file (other modes implemented elsewhere)
    return null;
  }

  // Apply mask with soft alpha blending preserving original colors
  // Assumes the frame (video) has already been drawn to ctx
  async function applyMask(ctx, mask) {
    if (!mask) return;
    try {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      if (mask.type === 'imageData') {
        const md = mask.data;
        // create mask canvas sized to mask data, then scale when compositing
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = md.width;
        maskCanvas.height = md.height;
        maskCanvas.getContext('2d').putImageData(md, 0, 0);

        // get current frame pixels
        const frameImage = ctx.getImageData(0, 0, w, h);
        // create a temporary to hold output with alpha applied
        const out = ctx.createImageData(w, h);

        // sample mask canvas data at scaled coords (nearest) to compute alpha per pixel
        const maskCtx = maskCanvas.getContext('2d');
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        for (let y = 0; y < h; y++) {
          const my = Math.floor(y * maskCanvas.height / h);
          for (let x = 0; x < w; x++) {
            const mx = Math.floor(x * maskCanvas.width / w);
            const mi = (my * maskCanvas.width + mx) * 4;
            const alpha = maskData[mi + 3] / 255;
            const fi = (y * w + x) * 4;
            // copy color and set alpha from mask
            out.data[fi] = frameImage.data[fi];
            out.data[fi + 1] = frameImage.data[fi + 1];
            out.data[fi + 2] = frameImage.data[fi + 2];
            out.data[fi + 3] = Math.round(alpha * 255);
          }
        }

        // composite: clear canvas then draw out ImageData (which contains alpha)
        ctx.clearRect(0, 0, w, h);
        ctx.putImageData(out, 0, 0);
      }
    } catch (err) {
      console.error('applyMask error:', err);
    }
  }

  return {
    init,
    processFrame,
    applyMask,
    _internal: { isReady: () => ready }
  };
})();