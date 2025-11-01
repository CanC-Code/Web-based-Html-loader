// detector.js — main thread handler
const outCanvas = document.getElementById('outputCanvas');
const outCtx = outCanvas.getContext('2d');
const modeSelect = document.getElementById('modeSelect');

let worker = null;
let processing = false;
let recordedBlobs = [];
let recorder = null;
let inputVideo = document.getElementById('inputVideo');

// Initialize Worker
async function initDetector() {
  if (worker) worker.terminate(); // reset
  worker = new Worker('detector-worker.js');

  return new Promise((resolve, reject) => {
    worker.onmessage = e => {
      const { type } = e.data;
      if (type === 'ready') {
        console.log('[Detector] Worker ready');
        resolve();
      }
      if (type === 'error') reject(e.data.message);
    };
    worker.postMessage({ type: 'init' });
  });
}

// Send a single frame for AI processing
function processFrame(frame) {
  if (!worker) return;
  worker.postMessage({ type: 'process', frame, mode: modeSelect.value });
}

// Handle returned mask from worker
worker?.onmessage = e => {
  const { type, maskBitmap } = e.data;
  if (type !== 'mask' || !maskBitmap) return;

  // Clear canvas & draw input video frame first
  outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(inputVideo, 0, 0, outCanvas.width, outCanvas.height);

  // Apply mask
  outCtx.save();
  if (modeSelect.value === 'remove') {
    outCtx.globalCompositeOperation = 'destination-in';
  } else if (modeSelect.value === 'blur') {
    outCtx.globalAlpha = 0.5; // Example: overlay blurred mask
  }
  outCtx.drawImage(maskBitmap, 0, 0, outCanvas.width, outCanvas.height);
  outCtx.restore();
};

// Start processing loop
async function startProcessing() {
  if (!inputVideo.src) return alert('Load a video first!');
  await initDetector();

  recordedBlobs = [];
  processing = true;

  // Start MediaRecorder to save output
  const stream = outCanvas.captureStream(30);
  recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
  recorder.ondataavailable = e => { if (e.data.size) recordedBlobs.push(e.data); };
  recorder.start(1000);

  inputVideo.currentTime = 0;
  await inputVideo.play();

  requestAnimationFrame(processLoop);
}

// Stop processing
function stopProcessing() {
  processing = false;
  recorder?.stop();
}

// Replay processed video
function playProcessed() {
  if (recordedBlobs.length === 0) return alert('No processed video to play.');
  const blob = new Blob(recordedBlobs, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  inputVideo.src = url;
  inputVideo.play();
}

// Download processed video
function downloadProcessed() {
  if (recordedBlobs.length === 0) return alert('Nothing recorded yet.');
  const blob = new Blob(recordedBlobs, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `processed_${Date.now()}.webm`;
  a.click();
}

// Processing loop — grabs frames from video and sends to worker
function processLoop() {
  if (!processing) return;

  const frame = outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height);
  processFrame(frame);

  requestAnimationFrame(processLoop);
}

// Export functions for HTML buttons
window.VideoDetector = {
  startProcessing,
  stopProcessing,
  playProcessed,
  downloadProcessed
};