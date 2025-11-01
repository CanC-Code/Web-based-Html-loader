// detector-worker.js — AI segmentation worker
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

let segmenter = null;
let ready = false;
let frameQueue = [];

// Initialize MediaPipe SelfieSegmentation
async function initDetector() {
  segmenter = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  segmenter.setOptions({ modelSelection: 1 });
  segmenter.onResults(results => {
    const maskCanvas = new OffscreenCanvas(results.segmentationMask.width, results.segmentationMask.height);
    const ctx = maskCanvas.getContext('2d');
    ctx.drawImage(results.segmentationMask, 0, 0);
    const imgData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    postMessage({ type: "mask", maskData: imgData.data.buffer, width: imgData.width, height: imgData.height }, [imgData.data.buffer]);
  });
  ready = true;
  postMessage({ type: "log", msg: "Detector ready" });
}

initDetector();

// Queue frames for processing
self.onmessage = async e => {
  const { type, frame, mode } = e.data;
  if (type !== "process" || !ready) return;

  try {
    // Create ImageBitmap for fast worker processing
    const bitmap = await createImageBitmap(frame);
    segmenter.send({ image: bitmap });
    bitmap.close();
  } catch (err) {
    postMessage({ type: "error", msg: err.toString() });
  }
};