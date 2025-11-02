// detector-worker.js

// This worker performs frame-level segmentation preprocessing.
// It supports combining multiple mask sources, temporal smoothing,
// and produces a final mask to be blended in processor-worker.js.

const FRAME_HISTORY = 3;
let history = [];

// Helper to apply temporal anti-aliasing
function temporalBlend(currentFrame) {
  history.push(currentFrame);
  if (history.length > FRAME_HISTORY) history.shift();

  const blended = new Uint8ClampedArray(currentFrame.length);
  for (let i = 0; i < currentFrame.length; i += 4) {
    let r = 0, g = 0, b = 0, a = 0;
    history.forEach(f => {
      r += f[i];
      g += f[i + 1];
      b += f[i + 2];
      a += f[i + 3];
    });
    const count = history.length;
    blended[i] = r / count;
    blended[i + 1] = g / count;
    blended[i + 2] = b / count;
    blended[i + 3] = a / count;
  }
  return blended;
}

// Merge multiple masks (e.g., MediaPipe + BodyPix)
function mergeMasks(mpMask, bpMask, width, height) {
  const maskData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const mpAlpha = mpMask[i * 4 + 3] / 255;
    const bpAlpha = bpMask[i]; // BodyPix gives single channel mask 0..1
    const alpha = Math.max(mpAlpha, bpAlpha);
    maskData[i * 4 + 0] = 0;
    maskData[i * 4 + 1] = 0;
    maskData[i * 4 + 2] = 0;
    maskData[i * 4 + 3] = alpha * 255;
  }
  return maskData;
}

self.onmessage = e => {
  const msg = e.data;

  if (msg.type === 'processMasks') {
    const { mpMask, bpMask, width, height } = msg;
    let combinedMask = mergeMasks(new Uint8ClampedArray(mpMask), new Uint8ClampedArray(bpMask), width, height);
    combinedMask = temporalBlend(combinedMask);

    self.postMessage({ type: 'mask', data: combinedMask.buffer }, [combinedMask.buffer]);
  }
};