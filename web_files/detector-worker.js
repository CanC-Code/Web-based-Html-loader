// detector-worker.js
// Compositor worker: receives frame ImageBitmap + mask ImageBitmap,
// performs temporal smoothing (EMA) on mask alpha channel, composites result
// onto the frame using OffscreenCanvas, and returns a processed ImageBitmap.
// Uses transfers to avoid copies. Lightweight and throttled.

let offscreen = null;
let offctx = null;

let width = 0;
let height = 0;

// Temporal smoothing state: store low-res alpha buffer for EMA
let smoothW = 128;
let smoothH = 128;
let smoothAlpha = null;
const EMA_ALPHA = 0.65; // smoothing factor (0..1) higher = more inertia

self.onmessage = async (ev) => {
  const data = ev.data;

  if (data.type === 'init') {
    postMessage({ type: 'ready' });
    return;
  }

  if (data.type === 'process') {
    try {
      const { frame, mask, mode = 'auto', maskOpacity = 0.5, width: w, height: h } = data;

      // initialize canvases if needed (use full output size)
      if (!offscreen || w !== width || h !== height) {
        width = w; height = h;
        offscreen = new OffscreenCanvas(width, height);
        offctx = offscreen.getContext('2d');
        // initialize smoothing buffer
        smoothW = Math.max(32, Math.min(256, Math.floor(width / 8)));
        smoothH = Math.max(32, Math.min(256, Math.floor(height / 8)));
        smoothAlpha = new Float32Array(smoothW * smoothH);
        for (let i = 0; i < smoothAlpha.length; i++) smoothAlpha[i] = 0;
      }

      // Draw mask (ImageBitmap) into a small offscreen to extract alpha channel
      const small = new OffscreenCanvas(smoothW, smoothH);
      const sctx = small.getContext('2d');
      sctx.drawImage(mask, 0, 0, smoothW, smoothH);
      const maskImg = sctx.getImageData(0, 0, smoothW, smoothH).data;

      // Update smoothAlpha via EMA on alpha channel
      for (let i = 0, j = 0; i < maskImg.length; i += 4, j++) {
        const a = maskImg[i + 3] / 255;
        smoothAlpha[j] = EMA_ALPHA * smoothAlpha[j] + (1 - EMA_ALPHA) * a;
      }

      // Reconstruct full-size smoothed mask into offctx as ImageData
      const maskFull = offctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        const sy = Math.floor(y * smoothH / height);
        for (let x = 0; x < width; x++) {
          const sx = Math.floor(x * smoothW / width);
          const si = sy * smoothW + sx;
          const alpha = Math.min(1, Math.max(0, smoothAlpha[si]));
          const off = (y * width + x) * 4;
          maskFull.data[off] = 255;
          maskFull.data[off + 1] = 255;
          maskFull.data[off + 2] = 255;
          maskFull.data[off + 3] = Math.round(alpha * 255 * maskOpacity);
        }
      }

      // Composite: draw frame, then use mask to composite subject over blurred background
      // Step 1: draw blurred background
      const bg = new OffscreenCanvas(Math.max(1, Math.round(width / 12)), Math.max(1, Math.round(height / 12)));
      const bgc = bg.getContext('2d');
      bgc.drawImage(frame, 0, 0, bg.width, bg.height);

      offctx.save();
      offctx.clearRect(0, 0, width, height);

      // Draw blurred background scaled to full
      offctx.filter = 'blur(10px)';
      offctx.drawImage(bg, 0, 0, width, height);
      offctx.filter = 'none';

      // Create a temporary subject canvas: draw original frame
      const subj = new OffscreenCanvas(width, height);
      const subjCtx = subj.getContext('2d');
      subjCtx.drawImage(frame, 0, 0, width, height);

      // Apply smoothed mask to subject (destination-in)
      const maskCanvas = new OffscreenCanvas(width, height);
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.putImageData(maskFull, 0, 0);

      subjCtx.globalCompositeOperation = 'destination-in';
      subjCtx.drawImage(maskCanvas, 0, 0, width, height);
      subjCtx.globalCompositeOperation = 'source-over';

      // Draw subject (masked) over blurred background
      offctx.drawImage(subj, 0, 0);

      offctx.restore();

      // Convert offscreen to ImageBitmap and return
      const outBitmap = offscreen.transferToImageBitmap();
      self.postMessage({ type: 'result', bitmap: outBitmap }, [outBitmap]);

      // Close transferred input bitmaps (they were transferred from main)
      try { frame.close(); } catch(e){}
      try { mask.close(); } catch(e){}

    } catch (err) {
      console.error('Worker processing error', err);
      self.postMessage({ type: 'error', message: String(err) });
    }
  }
};