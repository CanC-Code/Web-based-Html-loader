// detector-worker.js
// Receives: { type:'init', width, height } to set target mask size
// Receives frames: { frameId, bitmap } where bitmap is ImageBitmap at worker-side scaled size
// Returns: { frameId, mask } where mask is Uint8ClampedArray length width*height (0..255)

importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmentation = null;
let targetW = 0, targetH = 0;

async function initSegmentation(width, height) {
  targetW = width;
  targetH = height;

  segmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  segmentation.setOptions({
    modelSelection: 1,
    selfieMode: true
  });
  segmentation.onResults(onResults);

  // Post ready immediately; real model loading happens lazily
  postMessage({ type: 'ready' });
}

function onResults(results) {
  // results.segmentationMask is an HTMLImageElement / canvas-like image
  const maskImage = results.segmentationMask;
  if (!maskImage) {
    // produce full-zero mask
    const mask = new Uint8ClampedArray(targetW * targetH);
    postMessage({ frameId: results.frameId, mask }, [mask.buffer]);
    return;
  }

  // Draw maskImage onto OffscreenCanvas sized to targetW/targetH
  const tmp = new OffscreenCanvas(targetW, targetH);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(maskImage, 0, 0, targetW, targetH);
  const img = tctx.getImageData(0, 0, targetW, targetH);

  // Build single-channel alpha mask (0..255) using red channel (mask outputs grayscale)
  const mask = new Uint8ClampedArray(targetW * targetH);
  for (let i = 0; i < mask.length; i++) mask[i] = img.data[i*4];

  // frameId was attached previously via results (we attach when sending)
  // Some MediaPipe builds do not preserve custom fields; we'll rely on lastFrameId mapping instead
  const fid = results.frameId || self._lastFrameId || 0;
  postMessage({ frameId: fid, mask }, [mask.buffer]);
}

// Map to correlate incoming bitmaps to frameIds (if needed)
self._lastFrameId = 0;

onmessage = async (ev) => {
  const data = ev.data;
  if (!data) return;
  if (data.type === 'init') {
    await initSegmentation(data.width, data.height);
    return;
  }

  // Expect { frameId, bitmap }
  const { frameId, bitmap } = data;
  if (!segmentation) {
    // in case init wasn't awaited; still set defaults
    await initSegmentation(bitmap.width, bitmap.height);
  }
  // attach frameId so we can return it later
  self._lastFrameId = frameId;

  // MediaPipe expects an ImageBitmap or HTMLImageElement
  // we call segmentation.send({image: bitmap})
  try {
    segmentation.send({ image: bitmap, frameId: frameId });
  } catch (err) {
    // If segmentation.send fails because model not ready, return full-foreground mask as fallback
    const fallback = new Uint8ClampedArray(targetW * targetH);
    for (let i = 0; i < fallback.length; i++) fallback[i] = 255;
    postMessage({ frameId, mask: fallback }, [fallback.buffer]);
  }
};