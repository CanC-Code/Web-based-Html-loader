// processor-worker.js
// Receives per-frame ImageBitmap + optional alpha ArrayBuffer.
// Maintains accum mask, history, exclusion mask, applies effects, posts ImageBitmap back to main.
// Always responds with helpful messages; never throws uncaught.

let maskW = 0, maskH = 0;
let accum = null;       // Float32Array
let history = [];       // recent alpha Uint8Array
const HISTORY_MAX = 18;
let excludeMask = null; // Uint8Array 0/1
let swayAlpha = 0.25;
let feedbackInfluence = 0.85;

function postLog(msg){ postMessage({ type:'log', msg }); }

// safe init
function initMasks(w,h){
  maskW = w; maskH = h;
  const n = w*h;
  accum = new Float32Array(n);
  excludeMask = new Uint8Array(n);
  history = [];
  for(let i=0;i<n;i++){ accum[i]=0; excludeMask[i]=0; }
  postLog(`Worker masks initialized ${w}x${h}`);
}

// compute exclusion via variance over history
function computeExclusion(){
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
    excludeMask[i] = (variance > 0.02 && mean[i] > 0.04 && mean[i] < 0.96) ? 1 : 0;
  }
}

// apply feedback (no alpha buffer supplied by main in current flow)
// simple global effect based on accum thresholds
function applyFeedback(kind){
  const n = maskW*maskH;
  if(kind === 'like'){
    for(let i=0;i<n;i++){
      if(accum[i] > 0.35) accum[i] = Math.min(1, accum[i] + 0.12);
    }
  } else {
    for(let i=0;i<n;i++){
      if(accum[i] > 0.15) accum[i] = Math.max(0, accum[i] - 0.35);
    }
  }
  // recompute exclusion after feedback
  if(history.length >= 4) computeExclusion();
  postLog(`Applied feedback ${kind}`);
}

// Convert accum mask to ImageData alpha bytes
function buildMaskImageData(){
  const n = maskW*maskH;
  const img = new Uint8ClampedArray(n*4);
  for(let i=0;i<n;i++){
    const a = Math.max(0, Math.min(1, accum[i] * (excludeMask[i] ? 0.6 : 1)));
    const off = i*4;
    img[off] = 255; img[off+1] = 255; img[off+2] = 255; img[off+3] = Math.round(a * 255);
  }
  return new ImageData(img, maskW, maskH);
}

async function applyEffectAndReturn(bitmap, effect, replaceColor){
  try {
    // draw src
    const src = new OffscreenCanvas(maskW, maskH);
    const sctx = src.getContext('2d');
    sctx.drawImage(bitmap, 0, 0, maskW, maskH);

    // mask canvas
    const maskImg = buildMaskImageData();
    const maskCanvas = new OffscreenCanvas(maskW, maskH);
    const mctx = maskCanvas.getContext('2d');
    mctx.putImageData(maskImg, 0, 0);

    // out
    const out = new OffscreenCanvas(maskW, maskH);
    const octx = out.getContext('2d');

    if(effect === 'blur'){
      const tmp = new OffscreenCanvas(Math.max(2, Math.round(maskW/12)), Math.max(2, Math.round(maskH/12)));
      const tctx = tmp.getContext('2d');
      tctx.drawImage(src, 0, 0, tmp.width, tmp.height);
      octx.save(); octx.filter='blur(10px)'; octx.drawImage(tmp,0,0,maskW,maskH); octx.restore();
      const fg = new OffscreenCanvas(maskW, maskH); const fctx = fg.getContext('2d');
      fctx.drawImage(src,0,0,maskW,maskH); fctx.globalCompositeOperation='destination-in'; fctx.drawImage(maskCanvas,0,0);
      octx.drawImage(fg,0,0);
    } else if(effect === 'replaceColor'){
      octx.fillStyle = replaceColor || '#0d1117'; octx.fillRect(0,0,maskW,maskH);
      const fg = new OffscreenCanvas(maskW, maskH); const fctx = fg.getContext('2d');
      fctx.drawImage(src,0,0,maskW,maskH); fctx.globalCompositeOperation='destination-in'; fctx.drawImage(maskCanvas,0,0);
      octx.drawImage(fg,0,0);
    } else if(effect === 'desaturate'){
      octx.save(); octx.filter='grayscale(1) saturate(0.6)'; octx.drawImage(src,0,0,maskW,maskH); octx.restore();
      const fg = new OffscreenCanvas(maskW, maskH); const fctx = fg.getContext('2d');
      fctx.drawImage(src,0,0,maskW,maskH); fctx.globalCompositeOperation='destination-in'; fctx.drawImage(maskCanvas,0,0);
      octx.drawImage(fg,0,0);
    } else if(effect === 'isolateColor'){
      octx.save(); octx.filter='grayscale(1)'; octx.drawImage(src,0,0,maskW,maskH); octx.restore();
      const fg = new OffscreenCanvas(maskW, maskH); const fctx = fg.getContext('2d');
      fctx.filter='saturate(1.3)'; fctx.drawImage(src,0,0,maskW,maskH); fctx.globalCompositeOperation='destination-in'; fctx.drawImage(maskCanvas,0,0);
      octx.drawImage(fg,0,0);
    } else {
      // remove (transparent background)
      const fg = new OffscreenCanvas(maskW, maskH); const fctx = fg.getContext('2d');
      fctx.drawImage(src,0,0,maskW,maskH); fctx.globalCompositeOperation='destination-in'; fctx.drawImage(maskCanvas,0,0);
      octx.clearRect(0,0,maskW,maskH);
      octx.drawImage(fg,0,0);
    }

    const outBmp = await out.transferToImageBitmap();
    return outBmp;
  } catch(err){
    postMessage({ type:'error', err: String(err) });
    return null;
  }
}

onmessage = async (e) => {
  const d = e.data;
  try{
    if(d.type === 'init'){
      initMasks(d.w, d.h);
      return;
    }
    if(d.type === 'frame'){
      const { bitmap, alpha, effect, replaceColor, mode, progress } = d;
      // ensure masks initialized
      if(!accum) initMasks(d.w, d.h);
      // handle alpha (ArrayBuffer or null)
      let alphaArr;
      if(alpha){
        alphaArr = new Uint8Array(alpha);
        if(history.length >= HISTORY_MAX) history.shift();
        history.push(alphaArr.slice(0));
      } else {
        // fallback: use history difference if available
        if(history.length >= 2){
          const a0 = history[history.length-2], a1 = history[history.length-1];
          alphaArr = new Uint8Array(maskW*maskH);
          for(let i=0;i<maskW*maskH;i++) alphaArr[i] = Math.abs(a1[i]-a0[i]);
          history.push(alphaArr.slice(0));
          if(history.length > HISTORY_MAX) history.shift();
        } else {
          alphaArr = new Uint8Array(maskW*maskH);
          history.push(alphaArr.slice(0));
        }
      }

      // occasionally update exclusion map
      if(history.length >= 6) computeExclusion();

      // integrate into accum
      const n = maskW*maskH;
      for(let i=0;i<n;i++){
        const cur = alphaArr[i] / 255;
        accum[i] = accum[i] * (1 - swayAlpha) + cur * swayAlpha;
        if(excludeMask[i]) accum[i] *= 0.95;
      }

      // apply effect and send processed bitmap back
      const outBmp = await applyEffectAndReturn(bitmap, effect, replaceColor);
      if(outBmp) postMessage({ type:'processed', bitmap: outBmp, progress, final:false }, [outBmp]);
      // bitmap transferred closed by main when drawn
    } else if(d.type === 'finalize'){
      postMessage({ type:'processed', final:true, progress:100 });
    } else if(d.type === 'feedback'){
      applyFeedback(d.kind);
      postLog('feedback applied: ' + d.kind);
    } else if(d.type === 'reset'){
      initMasks(maskW, maskH);
      postLog('masks reset');
    }
  } catch(err){
    postMessage({ type:'error', err: String(err) });
    console.error('worker error:', err);
  }
};