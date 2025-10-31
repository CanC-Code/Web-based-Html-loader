// Web Worker assisted detector
let worker;
let processing = false;
let recording = false;
let recorder, recordedChunks = [];

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');

document.getElementById('videoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);
  video.load();
  video.onloadeddata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    statusEl.textContent = "Video loaded.";
  };
});

startBtn.onclick = async () => {
  if (!video.src) return alert("Please select a video first.");
  if (processing) return;

  if (!worker) {
    worker = new Worker('detector-worker.js');
    worker.onmessage = e => {
      if (e.data.type === 'mask') drawMask(e.data.mask, e.data.w, e.data.h);
    };
  }

  statusEl.textContent = "Starting detection...";
  processing = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  saveBtn.disabled = true;

  video.play();
  processLoop();

  // start recording processed output
  startRecording();
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

function processLoop() {
  if (!processing || video.paused || video.ended) return;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  worker.postMessage({ type: 'frame', frame });

  requestAnimationFrame(processLoop);
}

function drawMask(maskData, w, h) {
  const img = new ImageData(new Uint8ClampedArray(maskData), w, h);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d');
  mctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.drawImage(maskCanvas, 0, 0);
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
