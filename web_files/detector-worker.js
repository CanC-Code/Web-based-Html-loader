// detector-worker.js — background frame processor using Mediapipe
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

let seg = null;

self.onmessage = async (e) => {
  const { type, frame, width, height, effect } = e.data;

  if (type === "init") {
    seg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    seg.setOptions({ modelSelection: 1 });
    seg.onResults(results => {
      self.postMessage({ type: "mask", mask: results.segmentationMask, effect });
    });
    self.postMessage({ type: "ready" });
  }

  if (type === "process" && seg) {
    // create an offscreen canvas to feed the frame
    const offCanvas = new OffscreenCanvas(width, height);
    const offCtx = offCanvas.getContext('2d');
    offCtx.putImageData(frame, 0, 0);
    seg.send({ image: offCanvas });
  }
};