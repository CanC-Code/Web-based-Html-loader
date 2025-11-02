<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Video Cutout</title>
<style>
body {
  margin:0; font-family:Arial,sans-serif; background:#0d1117; color:#c9d1d9;
  display:flex; flex-direction:column; align-items:center; padding:1em;
}
h1 { font-size:1.3em; margin-bottom:0.5em; }
video, canvas { width:100%; max-width:640px; border-radius:12px; background:black; margin-bottom:1em; }
#controls { display:flex; flex-wrap:wrap; gap:0.5em; justify-content:center; margin-bottom:1em; }
button, input[type=file] {
  background:#238636; color:white; border:none; padding:0.6em 1em;
  border-radius:8px; font-size:1em; cursor:pointer;
}
button:disabled { background:#444c56; }
#status { font-size:0.9em; opacity:0.8; margin-top:0.5em; }
</style>
</head>
<body>

<h1>AI Video Cutout</h1>

<div id="controls">
  <input type="file" id="videoInput" accept="video/*" />
  <button id="startBtn" disabled>Start</button>
  <button id="downloadBtn" disabled>Download</button>
</div>

<video id="video" playsinline controls></video>
<canvas id="canvas"></canvas>
<p id="status">Waiting for video...</p>

<script src="https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js"></script>
<script>
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const input = document.getElementById('videoInput');
const startBtn = document.getElementById('startBtn');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');

let seg = null;
let mask = null;
let worker = null;
let mediaRecorder = null;
let recordedChunks = [];
let processing = false;

// Initialize MediaPipe Segmentation
async function initSeg() {
  seg = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  seg.setOptions({ modelSelection: 1 });
  seg.onResults(r => { mask = r.segmentationMask; });
  await seg.initialize();
}
initSeg();

// Load video
input.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  video.src = URL.createObjectURL(f);
  video.onloadeddata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    startBtn.disabled = false;
    status.textContent = 'Video ready. Press Start.';
  };
});

// Start processing
startBtn.onclick = () => {
  if (!seg) { status.textContent = 'Model loading...'; return; }
  if (worker) worker.terminate();
  worker = new Worker('processor-worker.js');
  recordedChunks = [];
  processing = true;

  // Setup MediaRecorder for output video
  const stream = canvas.captureStream(video.frameRate || 30);
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
  mediaRecorder.ondataavailable = e => { if(e.data.size>0) recordedChunks.push(e.data); };
  mediaRecorder.start();

  startBtn.disabled = true;
  downloadBtn.disabled = true;
  status.textContent = 'Processing video...';

  worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'frame') {
      const img = new ImageData(new Uint8ClampedArray(msg.data), canvas.width, canvas.height);
      ctx.putImageData(img, 0, 0);
    } else if (msg.type === 'done') {
      processing = false;
      mediaRecorder.stop();
      status.textContent = 'Processing complete. Video ready to play/download.';
      downloadBtn.disabled = false;
    }
  };

  video.currentTime = 0;
  video.play();
  processLoop();
};

// Download final video
downloadBtn.onclick = () => {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'segmented_video.webm';
  a.click();
};

// Frame-processing loop
function processLoop() {
  if (!processing) return;
  if (video.paused || video.ended) {
    worker.postMessage({ type: 'finish' });
    return;
  }

  seg.send({ image: video }).then(() => {
    if (!mask) return requestAnimationFrame(processLoop);

    const off = new OffscreenCanvas(canvas.width, canvas.height);
    const octx = off.getContext('2d');
    octx.drawImage(video, 0, 0, canvas.width, canvas.height);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(mask, 0, 0, canvas.width, canvas.height);

    const frame = octx.getImageData(0, 0, canvas.width, canvas.height);
    worker.postMessage({ type: 'frame', width: frame.width, height: frame.height, data: frame.data.buffer }, [frame.data.buffer]);

    requestAnimationFrame(processLoop);
  });
}
</script>

</body>
</html>