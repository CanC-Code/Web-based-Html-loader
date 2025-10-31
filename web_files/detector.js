// detector.js
// Main thread: runs MediaPipe SelfieSegmentation, sends frames+mask to compositor worker,
// and draws worker-returned processed ImageBitmaps into processed canvas.
// Also manages recording (MediaRecorder) of the processed canvas.

const inputVideo = document.getElementById('video');      // source video element
const processedCanvas = document.getElementById('canvas'); // output canvas element
const processedCtx = processedCanvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const maskOpacityInput = document.getElementById('maskOpacity');
const statusEl = document.getElementById('status');

let seg = null;                    // MediaPipe SelfieSegmentation instance
let compositor = null;             // Web Worker instance
let compositorBusy = false;
let running = false;
let latestMaskBitmap = null;
let lastSentAt = 0;
const minMsBetweenSends = 80;      // throttle to ~12 fps to worker

// Recording
let mediaRecorder = null;
let recordedChunks = [];

// Init compositor worker from local file 'detector-worker.js'
function initCompositorWorker() {
  if (compositor) return;
  compositor = new Worker('detector-worker.js');

  compositor.onmessage = (ev) => {
    const data = ev.data;
    if (data.type === 'ready') {
      setStatus('Compositor ready');
      return;
    }
    if (data.type === 'result') {
      // Received processed ImageBitmap
      const bitmap = ev.data.bitmap;
      // draw it
      processedCtx.clearRect(0,0,processedCanvas.width, processedCanvas.height);
      processedCtx.drawImage(bitmap, 0, 0, processedCanvas.width, processedCanvas.height);
      // close the bitmap to free memory
      try { bitmap.close(); } catch(e){}
      compositorBusy = false;
    }
    if (data.type === 'error') {
      console.error('Compositor worker error:', data.message);
      setStatus('Compositor error: ' + data.message);
      compositorBusy = false;
    }
  };
}

// Initialize MediaPipe SelfieSegmentation (main thread)
async function initSegmentation() {
  if (seg) return;
  seg = new SelfieSegmentation.SelfieSegmentation({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  seg.setOptions({ modelSelection: 1 }); // best quality modelSelection
  seg.onResults(onSegResults);
  setStatus('Segmentation initialized');
}

// Handler from MediaPipe — receives segmentationMask as an HTMLImageElement/CanvasImageSource
async function onSegResults(results) {
  if (!results || !results.segmentationMask) return;
  // Convert segmentationMask (CanvasImageSource) into an ImageBitmap for transfer
  try {
    if (latestMaskBitmap) { try{ latestMaskBitmap.close(); } catch(e){} }
    latestMaskBitmap = await createImageBitmap(results.segmentationMask);
  } catch (err) {
    console.warn('createImageBitmap(mask) failed:', err);
    latestMaskBitmap = null;
  }
}

// Draw loop + frame sending
async function frameLoop() {
  if (!running) return;

  // ensure video frame available
  if (inputVideo.readyState >= 2) {
    // draw input frame into temporary offscreen to create transferable ImageBitmap
    // use a small offscreen for speed? We will transfer full resolution frame for quality
    // but we throttle sending to avoid overload
    const now = performance.now();
    if (!compositorBusy && latestMaskBitmap && (now - lastSentAt > minMsBetweenSends)) {
      try {
        const frameBitmap = await createImageBitmap(inputVideo);
        compositorBusy = true;
        lastSentAt = now;

        // prepare message: mode and mask opacity available from UI
        const payload = {
          type: 'process',
          mode: 'auto', // or read from UI if you have multiple modes
          maskOpacity: parseFloat(maskOpacityInput?.value ?? 0.5)
        };

        // send frame + mask bitmaps (transfer them)
        compositor.postMessage({
          ...payload,
          frame: frameBitmap,
          mask: latestMaskBitmap,
          width: processedCanvas.width,
          height: processedCanvas.height
        }, [frameBitmap, latestMaskBitmap]);

        // after transfer, we no longer own latestMaskBitmap (it's transferred), so clear ref
        latestMaskBitmap = null;
      } catch (err) {
        console.error('Error creating/transferring frame Bitmap:', err);
        compositorBusy = false;
      }
    } else {
      // still draw last processed or draw input video if no processed available
      // If worker is busy and no processed result yet, we can draw the raw input as fallback.
      // Keep main canvas showing something responsive:
      processedCtx.drawImage(inputVideo, 0, 0, processedCanvas.width, processedCanvas.height);
    }
  }

  requestAnimationFrame(frameLoop);
}

// Start processing: init seg & worker, start playback and loop, start recorder
async function startProcessing() {
  if (running) return;
  if (!inputVideo.src) { setStatus('Load a video first'); return; }
  // ensure canvas sizing matches video
  processedCanvas.width = inputVideo.videoWidth;
  processedCanvas.height = inputVideo.videoHeight;

  setStatus('Initializing...');
  startBtnDisabled(true);
  stopBtnDisabled(false);
  saveBtnDisabled(true);

  initCompositorWorker();
  await initSegmentation();

  // Start MediaPipe segmentation on video frames by sending video to seg.send periodically
  // We'll run segmentation at ~12 fps to reduce load
  (async function segLoop() {
    while (running === false) {
      // wait until we set running true
      await new Promise(r => setTimeout(r, 50));
    }
  })();

  // Start video playback (if not already)
  try { await inputVideo.play(); } catch(e){ /* autoplay blocked; user must press play */ }

  // Start segmentation loop separately at lower rate
  let segRunning = true;
  (async function segmentationLoop(){
    while (running) {
      try {
        // send current video frame to MediaPipe segmentation
        await seg.send({ image: inputVideo });
      } catch(err) {
        console.warn('seg.send error', err);
      }
      // throttle segmentation frequency
      await new Promise(r => setTimeout(r, 90)); // ~11 fps segmentation
    }
    segRunning = false;
  })();

  // Start compositor loop
  running = true;
  // Start recording processed canvas
  startRecording();
  requestAnimationFrame(frameLoop);
  setStatus('Processing started');
}

// Stop processing
function stopProcessing() {
  if (!running) return;
  running = false;
  startBtnDisabled(false);
  stopBtnDisabled(true);
  // stop recording (MediaRecorder will stop and emit dataavailable)
  stopRecording();
  setStatus('Processing stopped — ready to save');
  saveBtnDisabled(false);
}

// Recording helpers
function startRecording() {
  recordedChunks = [];
  const stream = processedCanvas.captureStream(25);
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    setStatus('Recording complete. Use Save to download.');
  };
  mediaRecorder.start();
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// Save final recorded video
function saveRecording() {
  if (!recordedChunks || recordedChunks.length === 0) { setStatus('No recording available'); return; }
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `processed_${Date.now()}.webm`;
  a.click();
  setStatus('Saved processed video');
}

// UI helpers
function setStatus(s){ statusEl.textContent = s; console.log('[detector] ', s); }
function startBtnDisabled(v){ startBtn.disabled = v; }
function stopBtnDisabled(v){ stopBtn.disabled = v; }
function saveBtnDisabled(v){ saveBtn.disabled = v; }

// Wire UI
startBtn.onclick = async () => {
  if (!running) {
    running = true;
    await startProcessing();
  }
};
stopBtn.onclick = () => stopProcessing();
saveBtn.onclick = () => saveRecording();

// When page unload, cleanup worker and bitmaps
window.addEventListener('beforeunload', () => {
  if (compositor) { compositor.terminate(); compositor = null; }
  if (latestMaskBitmap) try{ latestMaskBitmap.close(); } catch(e){}
});