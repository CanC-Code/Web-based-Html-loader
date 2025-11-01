// processor-worker.js
// Receives per-frame ImageBitmap + alpha (Uint8Array) from main thread.
// Maintains accumMask (Float32Array) to refine foreground across frames.
// Implements simple object exclusion heuristic (periodic/high-variance areas like fans).
// Applies effects and returns processed ImageBitmap to main thread.

// Worker globals
let accumMask = null;
let maskW = 0, maskH = 0;
let history = []; // circular history of alpha arrays (Uint8Array)
const HISTORY_MAX = 16;
let swayAlpha = 0.25; // how quickly new masks update accum
let excludeMask = null; // Uint8Array 0/1 to mark excluded pixels
let processingCount = 0;
let lastFrameTime = 0;

function initMasks(w,h){
  maskW = w; maskH = h;
  accumMask = new Float32Array(w*h).fill(0);
  excludeMask = new Uint8Array(w*h).fill(0);
  history = [];
}

// compute variance across history and build exclusion map for periodic/high-variance regions
function computeExclusionFromHistory(){
  if(history.length < 6) return; // need enough frames
  const n = maskW*maskH;
  const mean = new Float32Array(n).fill(0);
  const sq = new Float32Array(n).fill(0);
  for(let k=0;k<history.length;k++){
    const arr = history[k];
    for(let i=0;i<n;i++){
      const v = arr[i] / 255;
      mean[i] += v;
      sq[i] += v*v;
    }
  }
  const L = history.length;
  for(let i=0;i<n;i++){
    mean[i] /= L;
    sq[i] = (sq[i]/L) - (mean[i]*mean[i]); // variance
  }
  // produce exclusion mask where variance is high and mean is moderate (0.2..0.8) -> indicator of oscillatory moving object
  for(let i=0;i<n;i++){
    const v = sq[i];
    const m = mean[i];
    // tune thresholds by experimentation
    if(v > 0.02 && m > 0.05 && m < 0.9){
      excludeMask[i] = 1;
    } else {
      excludeMask[i] = 0;
    }
  }
}

// apply feedback alpha (Uint8Array) to accumMask; kind = 'like' or 'dislike'
function applyFeedback(alphaArr, kind){
  const n = maskW*maskH;
  if(alphaArr.length !== n) return;
  const influence = 0.85;
  if(kind === 'like'){
    for(let i=0;i<n;i++){
      const a = alphaArr[i] / 255;
      if(a > 0.2) accumMask[i] = Math.min(1, accumMask[i] * (1 - influence) + influence * 1.0);
    }
  } else if(kind === 'dislike'){
    for(let i=0;i<n;i++){
      const a = alphaArr[i] / 255;
      if(a > 0.2) accumMask[i] = Math.max(0, accumMask[i] * (1 - influence));
    }
  }
}

async function applyEffectsAndReturn(frameBitmap, effect, replaceColor){
  // frameBitmap is ImageBitmap sized maskW x maskH (or similar)
  // We'll use OffscreenCanvas sized exactly maskW x maskH to process pixel data
  const off = new OffscreenCanvas(maskW, maskH);
  const octx = off.getContext('2d');
  octx.drawImage(frameBitmap, 0, 0, maskW, maskH);

  // Build mask ImageData from accumMask and exclusion
  const n = maskW*maskH;
  const maskImg = new ImageData(maskW, maskH);
  for(let i=0;i<n;i++){
    const a = accumMask[i] * (excludeMask[i] ? 0.15 : 1.0); // suppressed if excluded
    const alpha = Math.max(0, Math.min(1, a));
    const offi = i*4;
    maskImg.data[offi] = 255;
    maskImg.data[offi+1] = 255;
    maskImg.data[offi+2] = 255;
    maskImg.data[offi+3] = Math.round(alpha * 255);
  }

  // create mask canvas
  const maskCanvas = new OffscreenCanvas(maskW, maskH);
  const mctx = maskCanvas.getContext('2d');
  mctx.putImageData(maskImg, 0, 0);

  // Now composite according to effect
  const out = new OffscreenCanvas(maskW, maskH);
  const outCtx = out.getContext('2d');

  if(effect === 'blur'){
    // draw blurred background
    // cheap blur: scale down and scale up
    const tmp = new OffscreenCanvas(Math.max(2, Math.round(maskW/12)), Math.max(2, Math.round(maskH/12)));
    const tctx = tmp.getContext('2d');
    tctx.drawImage(off, 0, 0, tmp.width, tmp.height);
    outCtx.save();
    outCtx.filter = 'blur(10px)';
    outCtx.drawImage(tmp, 0, 0, maskW, maskH);
    outCtx.restore();
    // draw foreground masked
    const srcTmp = new OffscreenCanvas(maskW, maskH);
    const sctx = srcTmp.getContext('2d');
    sctx.drawImage(off, 0, 0, maskW, maskH);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskCanvas, 0, 0);
    outCtx.drawImage(srcTmp, 0, 0);
  } else if(effect === 'replaceColor'){
    // draw background color
    outCtx.fillStyle = replaceColor || '#0d1117';
    outCtx.fillRect(0,0,maskW,maskH);
    // draw foreground
    const srcTmp = new OffscreenCanvas(maskW, maskH);
    const sctx = srcTmp.getContext('2d');
    sctx.drawImage(off, 0, 0, maskW, maskH);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskCanvas, 0, 0);
    outCtx.drawImage(srcTmp, 0, 0);
  } else if(effect === 'desaturate'){
    // draw desaturated background
    outCtx.save();
    outCtx.filter = 'grayscale(1) saturate(0.6)';
    outCtx.drawImage(off, 0, 0, maskW, maskH);
    outCtx.restore();
    // draw foreground
    const srcTmp = new OffscreenCanvas(maskW, maskH);
    const sctx = srcTmp.getContext('2d');
    sctx.drawImage(off, 0, 0, maskW, maskH);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskCanvas, 0, 0);
    outCtx.drawImage(srcTmp, 0, 0);
  } else {
    // default remove: transparent background
    const srcTmp = new OffscreenCanvas(maskW, maskH);
    const sctx = srcTmp.getContext('2d');
    sctx.drawImage(off, 0, 0, maskW, maskH);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(maskCanvas, 0, 0);
    outCtx.clearRect(0,0,maskW,maskH);
    outCtx.drawImage(srcTmp, 0, 0);
  }

  // convert to ImageBitmap and return
  const resultBitmap = await out.transferToImageBitmap();
  return resultBitmap;
}

// handle incoming messages
onmessage = async (e) => {
  const data = e.data;
  if(data.type === 'processFrame'){
    // receive frameBitmap and alpha ArrayBuffer
    const { frameBitmap, alpha, w, h, effect, replaceColor, progress } = data;
    // if masks not init, init
    if(!accumMask || maskW !== w || maskH !== h){
      initMasks(w,h);
    }
    // reconstruct alpha Uint8Array (ArrayBuffer could have been transferred)
    const alphaArr = new Uint8Array(alpha);
    // push to history
    if(history.length >= HISTORY_MAX) history.shift();
    history.push(alphaArr.slice(0)); // copy
    // update exclusion heuristics periodically
    if(history.length >= Math.min(HISTORY_MAX, 8)){
      computeExclusionFromHistory();
    }
    // integrate alpha into accumMask with swayAlpha
    const n = w*h;
    for(let i=0;i<n;i++){
      const cur = alphaArr[i] / 255;
      accumMask[i] = accumMask[i] * (1 - swayAlpha) + cur * swayAlpha;
      // if excluded reduce contribution gradually
      if(excludeMask[i]) accumMask[i] *= 0.92;
    }
    // apply exclusion: zero out accum where excludeMask strongly present
    for(let i=0;i<n;i++){
      if(excludeMask[i]) accumMask[i] = accumMask[i] * 0.7; // suppress
    }

    // apply effects and return processed bitmap
    const processedBitmap = await applyEffectsAndReturn(frameBitmap, effect, replaceColor);
    postMessage({ type: 'processedBitmap', bitmap: processedBitmap, progress: progress || 0 }, [processedBitmap]);

    // cleanup hint
    frameBitmap.close();
    processingCount++;
  } else if(data.type === 'finalize'){
    // signal finalization to main: we post a final processedBitmap with final flag by sending an empty progress
    postMessage({ type: 'processedBitmap', final: true, progress: 100 });
  } else if(data.type === 'feedback'){
    // feedback sent: data.alpha is ArrayBuffer
    const alphaArr = new Uint8Array(data.alpha);
    applyFeedback(alphaArr, data.kind);
    // optional: immediately recompute exclusion after feedback
    if(history.length >= 4) computeExclusionFromHistory();
    postMessage({ type: 'log', msg: `Applied feedback ${data.kind}` });
  } else if(data.type === 'reset'){
    // reset accumMask/history
    initMasks(maskW, maskH);
    postMessage({ type: 'log', msg: 'Reset accum masks/history' });
  }
};