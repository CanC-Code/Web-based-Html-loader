importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let canvasWidth = 0;
let canvasHeight = 0;
let running = false;
const FRAME_HISTORY = 5;
let maskHistory = [];
let frameQueue = [];
let processedQueue = [];

async function initSegmentation(width, height){
  canvasWidth = width;
  canvasHeight = height;
  seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  seg.setOptions({ modelSelection:1 });
  await seg.initialize();
}

function blendMasks(currentMask){
  maskHistory.push(currentMask);
  if(maskHistory.length > FRAME_HISTORY) maskHistory.shift();

  const off = new OffscreenCanvas(canvasWidth,canvasHeight);
  const ctx = off.getContext('2d');
  ctx.clearRect(0,0,canvasWidth,canvasHeight);
  ctx.globalAlpha = 1 / maskHistory.length;

  maskHistory.forEach(m => ctx.drawImage(m,0,0,canvasWidth,canvasHeight));
  return ctx.getImageData(0,0,canvasWidth,canvasHeight);
}

self.onmessage = async e => {
  const msg = e.data;

  if(msg.type==='init'){
    await initSegmentation(msg.width,msg.height);
    postMessage({type:'ready'});
  }

  if(msg.type==='enqueue'){
    frameQueue.push(msg.bitmap);
    if(!running) processQueue();
  }

  if(msg.type==='stop'){
    running=false;
    postMessage({type:'done'});
  }
};

async function processQueue(){
  if(running) return;
  running=true;

  while(frameQueue.length){
    const bitmap = frameQueue.shift();

    const off = new OffscreenCanvas(canvasWidth,canvasHeight);
    const ctx = off.getContext('2d');
    ctx.drawImage(bitmap,0,0,canvasWidth,canvasHeight);

    const result = await seg.send({image: off});
    const mask = result.segmentationMask;

    const finalFrame = blendMasks(mask);
    processedQueue.push(finalFrame);

    postMessage({type:'frame', data:finalFrame.data.buffer}, [finalFrame.data.buffer]);
  }

  running=false;
}