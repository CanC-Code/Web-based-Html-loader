importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let initialized = false;

self.onmessage = async e => {
  const { type, frame, mode } = e.data;

  if (type === 'init' && !initialized) {
    seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({ modelSelection: 1 });
    seg.onResults(r => {});
    initialized = true;
    self.postMessage({ type: 'log', msg: 'Worker initialized.' });
  }

  if (type === 'process' && initialized) {
    const offCanvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = offCanvas.getContext('2d');
    ctx.putImageData(frame, 0, 0);
    
    await seg.send({ image: offCanvas });
    
    // Create mask (using OffscreenCanvas)
    const maskCanvas = new OffscreenCanvas(frame.width, frame.height);
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(seg.segmentationMask, 0, 0, frame.width, frame.height);
    const maskData = maskCtx.getImageData(0,0,frame.width,frame.height).data;

    self.postMessage({ type: 'mask', maskData, width: frame.width, height: frame.height });
  }

  if (type === 'finish') self.postMessage({ type: 'done' });
};