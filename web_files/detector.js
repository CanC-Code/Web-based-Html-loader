const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const worker = new Worker('detector-worker.js');
let processing = false;
let processedFrames = [];
let mediaRecorder = null;
let recordedChunks = [];

// Initialize worker
worker.postMessage({ type:'init' });

worker.onmessage = (e) => {
  const data = e.data;
  if(data.type === 'ready'){
    statusEl.textContent = 'Detector ready';
  } else if(data.type === 'mask'){
    drawMask(new Uint8ClampedArray(data.maskData), data.width, data.height);
  } else if(data.type === 'error'){
    statusEl.textContent = 'Worker error: ' + data.message;
  }
};

document.getElementById('videoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  video.src = URL.createObjectURL(file);
  video.load();
  video.onloadeddata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    statusEl.textContent = "Video loaded";
  };
});

document.getElementById('startBtn').onclick = async () => {
  if (!video.src) return;
  statusEl.textContent = "Processing...";
  processing = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('saveBtn').disabled = true;
  recordedChunks = [];

  // Start MediaRecorder for saving processed video
  const stream = canvas.captureStream(25);
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
  mediaRecorder.ondataavailable = e => { if(e.data.size>0) recordedChunks.push(e.data); };
  mediaRecorder.start();

  video.play();
  processLoop();
};

document.getElementById('stopBtn').onclick = () => {
  processing = false;
  video.pause();
  mediaRecorder.stop();
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('saveBtn').disabled = false;
  statusEl.textContent = "Processing stopped. Ready to save.";
};

document.getElementById('saveBtn').onclick = () => {
  if(recordedChunks.length === 0) return;
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'processed_' + Date.now() + '.webm';
  a.click();
  statusEl.textContent = "Video saved.";
};

function drawMask(maskData, w, h){
  const imgData = new ImageData(maskData, w, h);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.putImageData(imgData,0,0);
  ctx.restore();
}

async function processLoop(){
  if(!processing) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  worker.postMessage({ type:'process', frameData: frame.data.buffer, width: canvas.width, height: canvas.height }, [frame.data.buffer]);
  requestAnimationFrame(processLoop);
}