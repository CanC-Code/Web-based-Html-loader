// detector-worker.js — AI-powered background remover
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

let seg;

self.onmessage = async (e) => {
  const { type, frame } = e.data;
  if(type !== "process") return;

  if(!seg){
    seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({ modelSelection: 1 });
    await new Promise(resolve => seg.onResults(() => resolve()));
  }

  // Convert ImageData to HTMLCanvasElement for MediaPipe
  const offCanvas = new OffscreenCanvas(frame.width, frame.height);
  const offCtx = offCanvas.getContext("2d");
  offCtx.putImageData(frame, 0, 0);

  // Process frame
  seg.send({ image: offCanvas }).then(() => {
    // SelfieSegmentation automatically triggers onResults
    seg.onResults(results => {
      // segmentationMask is a canvas ImageBitmap
      if(results.segmentationMask){
        createImageBitmap(results.segmentationMask).then(maskBitmap => {
          const maskCanvas = new OffscreenCanvas(frame.width, frame.height);
          const maskCtx = maskCanvas.getContext("2d");
          maskCtx.drawImage(maskBitmap, 0, 0, frame.width, frame.height);
          const maskData = maskCtx.getImageData(0, 0, frame.width, frame.height).data;
          self.postMessage({ type: "mask", maskData, width: frame.width, height: frame.height });
        });
      }
    });
  });
};