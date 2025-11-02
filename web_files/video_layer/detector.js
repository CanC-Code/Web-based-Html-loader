importScripts();

// Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const input = document.getElementById('videoInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const featherSlider = document.getElementById('featherSlider');
const status = document.getElementById('status');

let seg = null;
let mask = null;
let worker = null;
let running = false;
let frames = [];

// Initialize MediaPipe
async function initSeg() {
  seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
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
    status.textContent = 'Ready to process.';
  };
});

// Start processing
startBtn.onclick = () => {
  if (!seg) { status.textContent = 'Model loading...'; return; }
  if (worker) worker.terminate();
  worker = new Worker('processor-worker.js');
  worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'frame') {
      const img = new ImageData(new Uint8ClampedArray(msg.data), canvas.width, canvas.height);
      ctx.putImageData(img, 0, 0);
      frames.push(canvas.toDataURL('image/webp', 0.9));
    } else if (msg.type === 'done') {
      running = false;
      stopBtn.disabled = true;
      downloadBtn.disabled = false;
      status.textContent = 'Processing done.';
      createVideoPlayback();
    }
  };
  running = true;
  frames = [];
  startBtn.disabled = true;
  stopBtn.disabled = false;
  video.play();
  processLoop();
};

// Stop
stopBtn.onclick = () => { running = false; stopBtn.disabled = true; downloadBtn.disabled = true; status.textContent = 'Stopped.'; };

// Download
downloadBtn.onclick = () => {
  if (!frames.length) return;
  const blobs = frames.map(f => {
    const bstr = atob(f.split(',')[1]);
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return u8;
  });
  const blob = new Blob(blobs, { type: 'video/webp' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'segmented_video.webp';
  a.click();
};

// Processing loop
function processLoop() {
  if (!running) return;
  if (video.paused || video.ended) { running = false; stopBtn.disabled = true; downloadBtn.disabled = false; return; }
  seg.send({ image: video }).then(() => {
    if (!mask) return requestAnimationFrame(processLoop);
    const off = new OffscreenCanvas(canvas.width, canvas.height);
    const octx = off.getContext('2d');
    octx.drawImage(video, 0, 0, canvas.width, canvas.height);
    octx.globalCompositeOperation = 'destination-in';
    octx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    const frame = octx.getImageData(0, 0, canvas.width, canvas.height);
    worker.postMessage({ type: 'blend', width: frame.width, height: frame.height, data: frame.data.buffer, feather: featherSlider.value }, [frame.data.buffer]);
    requestAnimationFrame(processLoop);
  });
}

// Create video playback
function createVideoPlayback() {
  const v = document.createElement('video');
  v.controls = true;
  v.autoplay = false;
  v.src = frames[0];
  const container = document.getElementById('videoContainer');
  container.appendChild(v);
}