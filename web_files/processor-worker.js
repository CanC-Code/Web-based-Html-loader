// processor-worker.js
// Worker handles accumulation, object-exclusion heuristics (fan detection), effects, feedback.
// Receives messages from main thread:
//  - { type:'frame', bitmap:ImageBitmap, alpha: ArrayBuffer|null, w, h, effect, replaceColor, mode, progress }
//  - { type:'finalize' }
//  - { type:'feedback', kind:'like'|'dislike' }
// Sends messages to main:
//  - { type:'processed', bitmap:ImageBitmap, progress: number, final?:true }
//  - { type:'log', msg: string }

let maskW = 0, maskH = 0;
let accum = null; // Float32Array
let history = []; // recent alpha frames (Uint8Array)
const HISTORY_MAX = 18;
let excludeMask = null; // Uint8Array 0/1
let feedbackQueue = []; // store feedback events
let processing = false;
let swayAlpha = 0.25; // how strongly new frame affects accum
let feedbackInfluence = 0.85;

function log(msg){ postMessage({ type:'log', msg }); }

// init masks for a run
function initMasks(w,h){
  maskW = w; maskH = h;
  const n = w*h;
  accum = new Float32Array(n);
  excludeMask = new Uint8Array(n);
  history = [];
  for(let i=0;i<n;i++){ accum[i]=0; excludeMask[i]=0; }
}

// utility: compute exclude mask from history (variance heuristic)
function updateExclusion(){
  if(history.length < 6) return;
  const n = maskW*maskH;
  const L = history.length;
  const mean = new Float32Array(n);
  const sq = new Float32Array(n);
  for(let k=0;k<L;k++){
    const a = history[k];
    for(let i=0;i<n;i++){
      const v = a[i]/255;
      mean[i] += v;
      sq[i] += v*v;
    }
  }
  for(let i=0;i<n;i++){
    mean[i] /= L;
    const variance = (sq[i]/L) - (mean[i]*mean[i]);
    // high variance + moderate mean -> oscillating object
    excludeMask[i] = (variance > 0.02 && mean[i] > 0.05 && mean[i] < 0.95) ? 1 : 0;
  }
}

// apply feedback: reinforce or suppress areas
function applyFeedbackAlpha(alphaArr, kind){
  const n = maskW*maskH;
  if(alphaArr.length !== n) return;
  if(kind === 'like'){
    for(let i=0;i<n;i++){
      if(alphaArr[i] > 64){
        accum[i] = Math.min(1, accum[i] * (1 - feedbackInfluence) + 1*feedbackInfluence);
      }
    }
  } else if(kind === 'dislike'){
    for(let i=0;i<n;i++){
      if(alphaArr[i] > 64){
        accum[i] = Math.max(0, accum[i] * (1 - feedbackInfluence));
      }
    }
  }
}

// effect application: uses OffscreenCanvas to produce final ImageBitmap
async function applyEffectAndReturn(frameBitmap, effect, replaceColorHex){
  // draw frame to offscreen canvas sized maskW x maskH
  const src = new OffscreenCanvas(maskW, maskH);
  const sctx = src.getContext('2d');
  sctx.drawImage(frameBitmap, 0, 0, maskW, maskH);

  // create mask image from accum
  const n = maskW * maskH;
  const maskImg = new ImageData(maskW, maskH);
  for(let i=0;i<n;i++){
    const alpha = Math.max(0, Math.min(1, accum[i] * (excludeMask[i] ? 0.6 : 1.0)));
    const off = i*4;
    maskImg.data[off] = 255;
    maskImg.data[off+1] = 255;
    maskImg.data[off+2] = 255;
    maskImg.data[off+3] = Math.round(alpha*255);
  }
  const maskCanvas = new OffscreenCanvas(maskW, maskH);
  const mctx = maskCanvas.getContext('2d');
  mctx.putImageData(maskImg, 0, 0);

  // out canvas
  const out = new OffscreenCanvas(maskW, maskH);
  const octx = out.getContext('2d');

  if(effect === 'blur'){
    // cheap blur: draw scaled down and back up
    const tmp = new OffscreenCanvas(Math.max(2, Math.round(maskW/12)), Math.max(2, Math.round(maskH/12)));
    const tctx = tmp.getContext('2d');
    tctx.drawImage(src, 0, 0, tmp.width, tmp.height);
    octx.save();
    octx.filter = 'blur(10px)';
    octx.drawImage(tmp, 0, 0, maskW, maskH);
    octx.restore();
    // draw foreground using mask
    const fg = new OffscreenCanvas(maskW, maskH);
    const fctx = fg.getContext('2d');
    fctx.drawImage(src, 0, 0, maskW, maskH);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    octx.drawImage(fg, 0, 0);
  } else if(effect === 'replaceColor'){
    octx.fillStyle = replaceColorHex || '#0d1117';
    octx.fillRect(0,0,maskW,maskH);
    const fg = new OffscreenCanvas(maskW, maskH);
    const fctx = fg.getContext('2d');
    fctx.drawImage(src, 0, 0, maskW, maskH);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    octx.drawImage(fg, 0, 0);
  } else if(effect === 'desaturate'){
    octx.save();
    octx.filter = 'grayscale(1) saturate(0.6)';
    octx.drawImage(src, 0, 0, maskW, maskH);
    octx.restore();
    const fg = new OffscreenCanvas(maskW, maskH);
    const fctx = fg.getContext('2d');
    fctx.drawImage(src, 0, 0, maskW, maskH);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    octx.drawImage(fg, 0, 0);
  } else if(effect === 'isolateColor'){
    // try to boost foreground saturation and desaturate background
    // draw desaturated background first
    octx.save();
    octx.filter = 'grayscale(1) contrast(0.9)';
    octx.drawImage(src, 0, 0, maskW, maskH);
    octx.restore();
    // draw foreground with increased saturation
    const fg = new OffscreenCanvas(maskW, maskH);
    const fctx = fg.getContext('2d');
    fctx.filter = 'saturate(1.35) contrast(1.05)';
    fctx.drawImage(src, 0, 0, maskW, maskH);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    octx.drawImage(fg, 0, 0);
  } else {
    // default: remove background (transparent)
    const fg = new OffscreenCanvas(maskW, maskH);
    const fctx = fg.getContext('2d');
    fctx.drawImage(src, 0, 0, maskW, maskH);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCanvas, 0, 0);
    octx.clearRect(0,0,maskW,maskH);
    octx.drawImage(fg, 0, 0);
  }

  const bmp = await out.transferToImageBitmap();
  return bmp;
}

onmessage = async (e) => {
  const data = e.data;
  if(data.type === 'frame'){
    try{
      const { bitmap, alpha, w, h, effect, replaceColor, mode, progress } = data;
      // initialize
      if(!accum || maskW !== w || maskH !== h) initMasks(w,h);

      // alpha may be an ArrayBuffer or null
      let alphaArr = null;
      if(alpha){
        alphaArr = new Uint8Array(alpha);
        // store copy in history for exclusion heuristics
        if(history.length >= HISTORY_MAX) history.shift();
        history.push(alphaArr.slice(0));
      } else {
        // if alpha is null (motion mode), attempt to use previous history to compute motion; simple fallback: use last two history frames difference
        if(history.length >= 2){
          const a1 = history[history.length-1];
          const a0 = history[history.length-2];
          alphaArr = new Uint8Array(maskW*maskH);
          for(let i=0;i<maskW*maskH;i++){
            alphaArr[i] = Math.abs(a1[i] - a0[i]);
          }
          history.push(alphaArr.slice(0));
          if(history.length > HISTORY_MAX) history.shift();
        } else {
          // no data: set alphaArr to zeros
          alphaArr = new Uint8Array(maskW*maskH);
          history.push(alphaArr.slice(0));
        }
      }

      // update exclusion heuristics occasionally
      if(history.length >= 6){
        updateExclusion();
      }

      // integrate alpha into accum using swayAlpha
      const n = maskW*maskH;
      for(let i=0;i<n;i++){
        const c = alphaArr[i] / 255;
        accum[i] = accum[i] * (1 - swayAlpha) + c * swayAlpha;
        // if excluded slightly reduce influence
        if(excludeMask[i]) accum[i] *= 0.95;
      }

      // process feedback queued (none in this simple flow; feedback messages handled separately)
      // apply effect
      const bmp = await applyEffectAndReturn(bitmap, effect, replaceColor);
      postMessage({ type:'processed', bitmap: bmp, progress: progress || 0 }, [bmp]);
      // bitmap transferred will be closed by main thread as needed
    } catch(err){
      postMessage({ type:'log', msg: 'frame processing error: ' + err });
      console.error(err);
    }
  } else if(data.type === 'finalize'){
    // when finalize requested, optionally send final image indicating completion
    postMessage({ type:'processed', final:true, progress:100 });
  } else if(data.type === 'feedback'){
    // in this design main did not send an alpha buffer for feedback; we accept simple 'like'/'dislike' which toggles accum globally
    if(data.kind === 'like'){
      // gently boost accum in regions with recent high accums
      const n = maskW*maskH;
      for(let i=0;i<n;i++){
        if(accum[i] > 0.35) accum[i] = Math.min(1, accum[i] + 0.12);
      }
      postMessage({ type:'log', msg:'Applied LIKE feedback' });
    } else if(data.kind === 'dislike'){
      const n = maskW*maskH;
      for(let i=0;i<n;i++){
        if(accum[i] > 0.25) accum[i] = Math.max(0, accum[i] - 0.35);
      }
      postMessage({ type:'log', msg:'Applied DISLIKE feedback' });
    }
    // recompute exclusion
    if(history.length >= 4) updateExclusion();
  } else if(data.type === 'reset'){
    initMasks(maskW, maskH);
    postMessage({ type:'log', msg:'Reset accum & history' });
  }
};