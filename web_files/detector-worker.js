// detector-worker.js — Web Worker for AI video frame processing
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

let ready = false;
let seg = null;

self.onmessage = async e => {
  const { type, frame, width, height, mode } = e.data;

  if (type === "init") {
    try {
      seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
      seg.setOptions({ modelSelection: 1 });
      seg.onResults(results => {
        self.postMessage({ type: "frameResult", mask: results.segmentationMask, width, height, mode });
      });
      ready = true;
      self.postMessage({ type: "ready" });
    } catch(err) {
      self.postMessage({ type: "error", msg: err.message });
    }
    return;
  }

  if (!ready || type !== "process") return;

  try {
    const imgBitmap = await createImageBitmap(frame);
    seg.send({ image: imgBitmap });
  } catch(err) {
    self.postMessage({ type: "error", msg: err.message });
  }
};