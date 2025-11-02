// detector.js

let segModel = null;
let worker = null;

// Initialize segmentation model
export async function initSegmentationModel() {
  if (segModel) return segModel;

  segModel = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });

  segModel.setOptions({
    modelSelection: 1, // Default full body
  });

  await segModel.initialize();

  return segModel;
}

// Process a video frame
export async function processFrame(videoElement, width, height) {
  if (!segModel) throw new Error("Segmentation model not initialized");

  return new Promise((resolve) => {
    segModel.onResults(results => {
      resolve(results.segmentationMask);
    });
    segModel.send({ image: videoElement });
  });
}

// Start processing loop
export async function startVideoProcessing(videoElement, canvas, ctx, onFrameCallback) {
  await initSegmentationModel();

  if (worker) worker.terminate();
  worker = new Worker('processor-worker.js');

  worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'frame') {
      const img = new ImageData(new Uint8ClampedArray(msg.data), canvas.width, canvas.height);
      ctx.putImageData(img, 0, 0);
      if (onFrameCallback) onFrameCallback(img);
    }
  };

  const loop = async () => {
    if (videoElement.paused || videoElement.ended) {
      worker.postMessage({ type: 'done' });
      return;
    }
    const mask = await processFrame(videoElement, canvas.width, canvas.height);
    if (mask) {
      const off = new OffscreenCanvas(canvas.width, canvas.height);
      const octx = off.getContext('2d');
      octx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(mask, 0, 0, canvas.width, canvas.height);
      const frame = octx.getImageData(0, 0, canvas.width, canvas.height);
      worker.postMessage({ type: 'blend', width: frame.width, height: frame.height, data: frame.data.buffer }, [frame.data.buffer]);
    }
    videoElement.requestVideoFrameCallback(loop);
  };

  videoElement.requestVideoFrameCallback(loop);
}