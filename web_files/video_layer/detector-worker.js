importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let width = 0, height = 0;
let frameQueue = [];
let running = false;
const FRAME_HISTORY = 5;
let maskHistory = [];

function gaussianFeather(maskData, w, h) {
  const newMask = new Uint8ClampedArray(maskData.length);
  const radius = 5; // feathering radius
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, count = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const idx = (ny * w + nx) * 4 + 3; // alpha channel
            sum += maskData[idx];
            count++;
          }
        }
      }
      const idx = (y * w + x) * 4 + 3;
      newMask[idx] = sum / count;
      newMask[idx-3] = maskData[idx-3];
      newMask[idx-2] = maskData[idx-2];
      newMask[idx-1] = maskData[idx-1];
    }
  }
  return newMask;
}

function blendMasks(currentMask) {
  maskHistory.push(currentMask);
  if (maskHistory.length > FRAME_HISTORY) maskHistory.shift();

  const blended = new Uint8ClampedArray(currentMask.length);
  for (let i = 0; i < currentMask.length; i += 4) {
    let r = 0, g = 0, b = 0, a = 0;
    maskHistory.forEach(m => {
      r += m[i]; g += m[i+1]; b += m[i+2]; a += m[i+3];
    });
    const count = maskHistory.length;
    blended[i] = r / count;
    blended[i+1] = g / count;
    blended[i+2] = b / count;
    blended[i+3] = a / count;
  }

  return blended;
}

async function processFrame(frameBitmap) {
  const off = new OffscreenCanvas(width, height);
  const ctx = off.getContext('2d');
  ctx.drawImage(frameBitmap, 0, 0, width, height);

  const results = await seg.send({image: off});
  let mask = results.segmentationMask;

  const offMask = new OffscreenCanvas(width, height);
  const maskCtx = offMask.getContext('2d');
  maskCtx.drawImage(mask, 0, 0, width, height);
  let maskData = maskCtx.getImageData(0, 0, width, height).data;

  // Feather edges dynamically
  maskData = gaussianFeather(maskData, width, height);

  // Blend with previous frames
  const blended = blendMasks(maskData);

  postMessage({type:'frame', data:blended.buffer}, [blended.buffer]);
}

self.onmessage = async (e) => {
  const msg = e.data;
  if(msg.type === 'init'){
    width = msg.width;
    height = msg.height;
    seg = new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({modelSelection:1});
    await seg.initialize();
    postMessage({type:'ready'});
  }
  if(msg.type === 'enqueue'){
    frameQueue.push(msg.bitmap);
    if(!running) processQueue();
  }
};

async function processQueue() {
  running = true;
  while(frameQueue.length){
    const frame = frameQueue.shift();
    await processFrame(frame);
  }
  running = false;
}