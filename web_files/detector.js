// detector.js
// Detector module for Video Layer — supports modes: 'motion', 'all', 'human'.
// Exposes: async Detector.init(options), async Detector.processFrame(ImageData, opts), Detector.applyMask(ctx, mask)

const Detector = (function () {
  // internal state
  let ready = false;
  let mode = 'motion';
  let usingWorker = false;
  let cvLoaded = false;
  let seg = null; // MediaPipe SelfieSegmentation instance
  let lastSegMask = null; // last segmentation mask as ImageBitmap
  let segPendingResolve = null;
  let prevGray = null;
  let mog2 = null;

  // helper to load script
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

  // Load OpenCV.js (lazy)
  async function ensureOpenCV() {
    if (cvLoaded && window.cv && cv.Mat) return;
    await loadScript('https://docs.opencv.org/4.x/opencv.js');
    // wait for runtime init
    await new Promise((resolve) => {
      if (window.cv && cv.Mat) return resolve();
      cv['onRuntimeInitialized'] = () => resolve();
    });
    cvLoaded = true;
  }

  // Initialize MediaPipe SelfieSegmentation on main thread
  async function ensureSelfieSeg() {
    if (seg) return;
    // load mediapipe if not present
    if (!window.SelfieSegmentation) {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    }
    seg = new SelfieSegmentation.SelfieSegmentation({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    seg.setOptions({ modelSelection: 1, selfieMode: false });
    seg.onResults(results => {
      // segmentationMask is a CanvasImageSource
      // create ImageBitmap for transfer/usage
      if (!results || !results.segmentationMask) {
        lastSegMask = null;
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
        return;
      }
      // createImageBitmap is async — store bitmap and resolve promise
      createImageBitmap(results.segmentationMask).then(bitmap => {
        // free previous bitmap
        if (lastSegMask) {
          try { lastSegMask.close(); } catch (e) {}
        }
        lastSegMask = bitmap;
        if (segPendingResolve) {
          segPendingResolve(bitmap);
          segPendingResolve = null;
        }
      }).catch(err => {
        console.warn('createImageBitmap failed', err);
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
      });
    });
  }

  // Public init
  async function init(options = {}) {
    mode = options.mode || mode;
    // if human mode requested, load MediaPipe (it will be used)
    if (mode === 'human') {
      await ensureSelfieSeg();
    } else {
      // if not human, we still want to be ready enough: load OpenCV for motion/all
      await ensureOpenCV();
      // setup MOG2 if motion mode
      if (mode === 'motion') {
        try {
          mog2 = new cv.BackgroundSubtractorMOG2(500, 16, true);
        } catch (err) {
          // fallback if constructor not available -> we'll use frame differencing
          mog2 = null;
        }
      }
    }
    ready = true;
    return true;
  }

  // Helper: run selfie seg on a temporary canvas image and await mask
  async function runSegmentationOnFrame(imageData) {
    if (!seg) await ensureSelfieSeg();
    // draw imageData to offscreen canvas and call seg.send
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    const tctx = tmp.getContext('2d');
    tctx.putImageData(imageData, 0, 0);

    // prepare a promise that resolves when onResults sets lastSegMask
    const p = new Promise((resolve) => {
      segPendingResolve = resolve;
      // send image
      seg.send({ image: tmp });
      // set a timeout fallback in 750ms
      setTimeout(() => {
        if (segPendingResolve) { segPendingResolve(null); segPendingResolve = null; }
        resolve(null);
      }, 750);
    });
    return await p; // ImageBitmap or null
  }

  // Convert ImageBitmap or ImageData to mask ImageData (alpha channel 0..255)
  // For ImageBitmap: draw to temp canvas then extract ImageData
  async function bitmapToMaskImageData(bitmap) {
    if (!bitmap) return null;
    const tmp = document.createElement('canvas');
    tmp.width = bitmap.width;
    tmp.height = bitmap.height;
    const ctx2 = tmp.getContext('2d');
    ctx2.drawImage(bitmap, 0, 0);
    const id = ctx2.getImageData(0, 0, tmp.width, tmp.height);
    // segmentation mask produced by MediaPipe uses alpha channel or greyscale: convert to single-channel alpha map
    const w = id.width, h = id.height;
    const out = new ImageData(w, h);
    for (let i = 0, j = 0; i < id.data.length; i += 4, j++) {
      // MediaPipe segmentationMask: R/G/B are the mask color, A = 255 or 0? Some builds use alpha; check brightness
      // We'll compute brightness to decide mask presence
      const r = id.data[i], g = id.data[i + 1], b = id.data[i + 2], a = id.data[i + 3];
      let alpha = 0;
      if (a !== 0) {
        // if there's alpha, use it
        alpha = a;
      } else {
        // else use luminance threshold
        const lum = (r + g + b) / 3;
        alpha = lum > 128 ? 255 : 0;
      }
      const off = j * 4;
      out.data[off] = 255;
      out.data[off + 1] = 255;
      out.data[off + 2] = 255;
      out.data[off + 3] = alpha;
    }
    return out;
  }

  // Motion mask via frame differencing (fast)
  function motionMaskFromImageData(imageData) {
    // requires OpenCV
    if (!cv || !cv.Mat) return null;
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let mask = new cv.Mat();
    if (mog2) {
      mog2.apply(src, mask);
      // mask already single channel
      cv.threshold(mask, mask, 128, 255, cv.THRESH_BINARY);
    } else {
      if (!prevGray) {
        prevGray = gray.clone();
        src.delete(); // delete src, keep prevGray
        return null;
      }
      cv.absdiff(gray, prevGray, mask);
      cv.threshold(mask, mask, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(mask, mask, 5);
    }

    if (prevGray) {
      prevGray.delete();
    }
    prevGray = gray.clone();

    src.delete();
    // convert mask (cv.Mat single channel) to ImageData
    const w = mask.cols, h = mask.rows;
    const out = new ImageData(w, h);
    for (let i = 0, j = 0; i < mask.data.length; i++, j += 4) {
      const v = mask.data[i];
      out.data[j] = 255;
      out.data[j + 1] = 255;
      out.data[j + 2] = 255;
      out.data[j + 3] = v;
    }
    mask.delete();
    return out;
  }

  // Edge mask via Canny
  function edgeMaskFromImageData(imageData) {
    if (!cv || !cv.Mat) return null;
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 80, 160);
    const w = edges.cols, h = edges.rows;
    const out = new ImageData(w, h);
    for (let i = 0, j = 0; i < edges.data.length; i++, j += 4) {
      const v = edges.data[i];
      out.data[j] = 255;
      out.data[j + 1] = 255;
      out.data[j + 2] = 255;
      out.data[j + 3] = v;
    }
    src.delete(); gray.delete(); edges.delete();
    return out;
  }

  // Public: processFrame(ImageData) -> returns mask object (or null)
  // Mask object shapes:
  //   { type: 'imageData', data: ImageData }   // for CPU masks
  //   { type: 'bitmap', bitmap: ImageBitmap }  // for MediaPipe mask (fast)
  async function processFrame(imageData, opts = {}) {
    if (!ready) {
      // attempt to init default libs to allow fallback operation
      try {
        if (mode === 'human') await ensureSelfieSeg();
        else await ensureOpenCV();
        ready = true;
      } catch (e) {
        console.warn('Detector not ready:', e);
        return null;
      }
    }

    const requestedMode = (opts.mode || mode || 'motion');

    // Human mode uses MediaPipe segmentation
    if (requestedMode === 'human') {
      try {
        // run segmentation and get ImageBitmap
        const bitmap = await runSegmentationOnFrame(imageData);
        if (!bitmap) return null;
        // Return bitmap type mask (caller can composite)
        return { type: 'bitmap', bitmap: bitmap };
      } catch (err) {
        console.warn('Segmentation failed', err);
        return null;
      }
    }

    // For motion/all use OpenCV masks
    try {
      await ensureOpenCV();
      if (requestedMode === 'motion') {
        const maskId = motionMaskFromImageData(imageData);
        if (!maskId) return null;
        return { type: 'imageData', data: maskId };
      } else if (requestedMode === 'all') {
        const maskId = edgeMaskFromImageData(imageData);
        return { type: 'imageData', data: maskId };
      }
    } catch (err) {
      console.error('Frame processing error:', err);
      return null;
    }
    return null;
  }

  // Public: applyMask(ctx, mask)
  // Composites the mask over current canvas drawing (assumes the video frame is already drawn)
  // For 'human' -> mask may be bitmap: we will use destination-in to keep person, removing background
  // For imageData masks -> draw mask as alpha where present to keep subject
  async function applyMask(ctx, mask) {
    if (!mask) return;
    try {
      if (mask.type === 'bitmap') {
        // keep person area: use destination-in composite with mask drawn as alpha
        // Draw mask to temp canvas with same size as target
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const tmp = document.createElement('canvas');
        tmp.width = mask.bitmap.width;
        tmp.height = mask.bitmap.height;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(mask.bitmap, 0, 0);
        // Convert to mask where alpha specifies person presence:
        // We want to scale mask bitmap to target canvas size then use it to clip
        ctx.save();
        // First create an intermediate to hold the existing frame
        const frameImg = ctx.getImageData(0, 0, w, h);
        // clear canvas
        ctx.clearRect(0, 0, w, h);
        // draw mask scaled to canvas
        ctx.drawImage(tmp, 0, 0, w, h);
        // use globalCompositeOperation = 'source-in' to keep only mask area of previous frame
        ctx.globalCompositeOperation = 'source-in';
        // draw the saved frame (as ImageData) onto canvas, but only masked area remains
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = w; frameCanvas.height = h;
        frameCanvas.getContext('2d').putImageData(frameImg, 0, 0);
        ctx.drawImage(frameCanvas, 0, 0, w, h);
        // restore composite mode
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();

        // Close ImageBitmap to free memory
        try { mask.bitmap.close(); } catch (e) {}
      } else if (mask.type === 'imageData') {
        // mask.data is ImageData with alpha channel
        // draw mask to temp canvas, then use it as a clipping mask (destination-in)
        const md = mask.data;
        const mw = md.width, mh = md.height;
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const tmp = document.createElement('canvas');
        tmp.width = mw; tmp.height = mh;
        tmp.getContext('2d').putImageData(md, 0, 0);

        ctx.save();
        // save current frame
        const frameImg = ctx.getImageData(0, 0, w, h);
        // clear
        ctx.clearRect(0, 0, w, h);
        // draw mask scaled
        ctx.drawImage(tmp, 0, 0, w, h);
        // set composite to source-in, draw frame, leaving only masked area
        ctx.globalCompositeOperation = 'source-in';
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = w; frameCanvas.height = h;
        frameCanvas.getContext('2d').putImageData(frameImg, 0, 0);
        ctx.drawImage(frameCanvas, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }
    } catch (err) {
      console.error('applyMask error', err);
    }
  }

  // Expose API
  return {
    init: async (options = {}) => {
      mode = options.mode || mode;
      // initialize required libs for requested mode
      if (mode === 'human') {
        await ensureSelfieSeg();
      } else {
        await ensureOpenCV();
        if (mode === 'motion') {
          try { mog2 = new cv.BackgroundSubtractorMOG2(500, 16, true); } catch(e){ mog2 = null; }
        }
      }
      ready = true;
      return true;
    },
    processFrame,
    applyMask,
    // helper flags for UI
    _internal: { isReady: () => ready }
  };
})();