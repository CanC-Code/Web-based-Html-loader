let worker;
let processing = false;
let recording = false;
let showMask = true;
let maskOpacity = 0.5;
let drawMode = false;
let isDrawing = false;
let lastX = 0, lastY = 0;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const maskEditor = document.getElementById('maskEditor');
const mctx = maskEditor.getContext('2d');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const modeSelect = document.getElementById('modeSelect');
const opacityRange = document.getElementById('opacityRange');
const toggleMaskBtn = document.getElementById('toggleMaskBtn');

let recorder, recordedChunks = [];

document.getElementById('videoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);
  video.load();
  video.onloadeddata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    maskEditor.width = video.videoWidth;
    maskEditor.height = video.videoHeight;
    clearMaskEditor();
    statusEl.textContent = "Video loaded.";
  };
});

startBtn.onclick = async () => {
  if (!video.src) return alert("Select a video first.");
  if (processing) return;

  if (!worker) {
    worker = new Worker('detector-worker.js');
    worker.onmessage = e => {
      if (e.data.type === 'mask') drawMask(e.data.mask, e.data.w, e.data.h);
    };
  }

  processing = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  saveBtn.disabled = true;
  video.play();
  startRecording();
  processLoop();
  statusEl.textContent = "Processing started...";
};

stopBtn.onclick = () => {
  processing = false;
  stopRecording();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
  statusEl.textContent = "Stopped.";
};

saveBtn.onclick = () => {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "processed_output.webm";
  a.click();
};

toggleMaskBtn.onclick = () => {
  showMask = !showMask;
};

opacityRange.oninput = e => maskOpacity = parseFloat(e.target.value);

maskEditor.addEventListener('mousedown', e => {
  if (modeSelect.value !== "custom") return;
  isDrawing = true;
  const rect = maskEditor.getBoundingClientRect();
  [lastX, lastY] = [e.clientX - rect.left, e.clientY - rect.top];
});

maskEditor.addEventListener('mouseup', () => isDrawing = false);
maskEditor.addEventListener('mouseleave', () => isDrawing = false);

maskEditor.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const rect = maskEditor.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  mctx.strokeStyle = "rgba(0,255,0,0.5)";
  mctx.lineWidth = 15;
  mctx.lineCap = "round";
  mctx.beginPath();
  mctx.moveTo(lastX, lastY);
  mctx.lineTo(x, y);
  mctx.stroke();
  [lastX, lastY] = [x, y];
});

function clearMaskEditor() {
  mctx.clearRect(0, 0, maskEditor.width, maskEditor.height);
}

function processLoop() {
  if (!processing || video.paused || video.ended) return;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  worker.postMessage({
    type: 'frame',
    frame,
    mode: modeSelect.value
  });

  requestAnimationFrame(processLoop);
}

function drawMask(maskData, w, h) {
  if (!showMask) return;
  const img = new ImageData(new Uint8ClampedArray(maskData), w, h);
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = maskOpacity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

function startRecording() {
  const stream = canvas.captureStream(30);
  recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  recordedChunks = [];
  recorder.ondataavailable = e => recordedChunks.push(e.data);
  recorder.start();
  recording = true;
}

function stopRecording() {
  if (recorder && recording) {
    recorder.stop();
    recording = false;
  }
}
