// detector-worker.js — AI-powered background remover (MediaPipe)
// Works as a dedicated worker to prevent UI freeze

// Import MediaPipe SelfieSegmentation
importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let ready = false;

self.onmessage = async (e) => {
  const { type, frame, mode } = e.data;

  if (type === 'init') {
    try {
      // Initialize MediaPipe
      seg = new SelfieSegmentation({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
      });
      seg.setOptions({ modelSelection: 1 }); // 0 = general, 1 = landscape
      seg.onResults(results => {
        // Store latest mask in transferable
        self.postMessage({ type: 'mask', maskBitmap: results.segmentationMask }, [results.segmentationMask]);
      });
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }

  // Process a single frame
  if (type === 'process' && ready) {
    try {
      // Convert ImageData to HTMLCanvasElement
      const off = new OffscreenCanvas(frame.width, frame.height);
      const ctx = off.getContext('2d');
      ctx.putImageData(frame, 0, 0);

      // Send to MediaPipe
      await seg.send({ image: off });

      // The mask is sent back in onResults
    } catch (err) {
      console.error('Worker process error:', err);
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};