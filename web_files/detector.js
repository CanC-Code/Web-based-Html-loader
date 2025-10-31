// detector.js — stable wrapper for MediaPipe SelfieSegmentation (expects global SelfieSegmentation loaded)
const Detector = (function(){
  let seg = null;
  let lastMaskBitmap = null;
  let pending = null;

  // initialize: builds a SelfieSegmentation instance (if global available)
  async function init(opts = {}){
    if(typeof SelfieSegmentation === 'undefined'){
      throw new Error('SelfieSegmentation not found. Ensure the MediaPipe script is included before detector.js');
    }
    // construct: some CDN builds export the constructor directly, some under namespace; try both
    let Ctor = null;
    if(typeof SelfieSegmentation === 'function') Ctor = SelfieSegmentation;
    else if(SelfieSegmentation && typeof SelfieSegmentation.SelfieSegmentation === 'function') Ctor = SelfieSegmentation.SelfieSegmentation;
    else throw new Error('SelfieSegmentation constructor not found in global namespace.');

    seg = new Ctor({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
    seg.setOptions({ modelSelection: 1 });
    seg.onResults(results => {
      // store segmentationMask (CanvasImageSource). Convert to ImageBitmap for reliable drawing/resizing.
      if(results && results.segmentationMask){
        // create bitmap asynchronously and save
        createImageBitmap(results.segmentationMask).then(bmp=>{
          // free old
          try{ if(lastMaskBitmap && typeof lastMaskBitmap.close==='function') lastMaskBitmap.close(); }catch(e){}
          lastMaskBitmap = bmp;
          // resolve pending promise if present
          if(pending && typeof pending.resolve === 'function'){ pending.resolve(bmp); pending = null; }
        }).catch(err=>{
          if(pending && typeof pending.resolve==='function'){ pending.resolve(null); pending=null; }
          console.warn('createImageBitmap failed:', err);
        });
      } else {
        if(pending && typeof pending.resolve==='function'){ pending.resolve(null); pending=null; }
      }
    });

    return true;
  }

  // processFrame(videoElement) -> returns most recent ImageBitmap mask (may be null)
  // Accepts either HTMLVideoElement or ImageData (we'll use videoElement for best results).
  async function processFrame(src){
    if(!seg) throw new Error('Detector not initialised (call Detector.init())');

    // If a previous pending call exists, return its promise
    if(pending){
      // avoid sending a new request while one is pending; return the existing promise so caller can await up-to-date mask
      return pending.promise;
    }

    // create promise pair
    let resolveFn, rejectFn;
    const p = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

    pending = { promise: p, resolve: resolveFn, reject: rejectFn };

    try {
      // seg.send accepts camera/video/canvas/image element
      await seg.send({ image: src });
      // the onResults callback will resolve the pending promise when mask created (or null)
    } catch(err){
      // if send fails, clear pending and return null
      pending = null;
      console.warn('seg.send failed:', err);
      return null;
    }

    return p;
  }

  // Apply mask to a destination 2D context:
  // The destination canvas should already contain the background (blur or replacement).
  // The function will draw the person (from the video frame) only where the mask indicates subject presence.
  async function applyMask(ctx, maskBitmap){
    if(!maskBitmap) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;

    // temp canvas: capture current video frame from caller (they drew video into a temp or can provide)
    // The caller uses mask with the live video; here we assume the caller has captured the video into a temp canvas
    // To keep API simple, we will let caller draw the frame into a temp canvas and pass that as frameCanvas if needed
    // But for convenience, we will require the caller to have the original frame in an offscreen canvas or use the DOM video element.
    // In our usage the caller creates a temp canvas with the video frame and we draw it here.

    // For robustness, we will create a temp canvas and read the current pixel data from an existing global "video" if present:
    let sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    let sctx = sourceCanvas.getContext('2d');
    // try to find a DOM video element on the page
    const v = document.querySelector('video');
    if(v && v.videoWidth>0){
      sctx.drawImage(v, 0, 0, w, h);
    } else {
      // fallback: do nothing (mask application will be skipped)
      return;
    }

    // Now composite: draw mask, then keep only source where mask is present using source-in
    // Step 1: draw mask to destination canvas (as destination)
    ctx.save();
    // draw mask scaled to canvas
    ctx.globalCompositeOperation = 'destination-over'; // ensure background stays
    ctx.drawImage(maskBitmap, 0, 0, w, h);

    // Step 2: source-in draw the person pixels from sourceCanvas onto destination (keeps only where mask exists)
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(sourceCanvas, 0, 0, w, h);

    // restore
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // close bitmap to free memory when caller expects not to reuse it
    try{ if(typeof maskBitmap.close === 'function') maskBitmap.close(); }catch(e){}
  }

  return { init, processFrame, applyMask };
})();