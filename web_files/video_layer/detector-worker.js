importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let canvasWidth = 0;
let canvasHeight = 0;
let frameQueue = [];
let running = false;

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    canvasWidth = msg.width;
    canvasHeight = msg.height;
    seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
    seg.setOptions({ modelSelection: 1 });
    await seg.initialize();
    postMessage({ type: 'ready' });
  }

  if (msg.type === 'frame') {
    if (!running) running = true;

    // Convert ImageBitmap to canvas
    const off = new OffscreenCanvas(canvasWidth, canvasHeight);
    const ctx = off.getContext('2d');
    ctx.drawImage(msg.bitmap, 0, 0, canvasWidth, canvasHeight);

    await seg.send({ image: off });

    const mask = seg.segmentationMask;
    if (mask) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.filter = 'blur(1px)'; // Feathering
      ctx.drawImage(mask, 0, 0, canvasWidth, canvasHeight);
    }

    const frame = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    frameQueue.push(frame);

    postMessage({ type: 'frame', data: frame.data.buffer }, [frame.data.buffer]);
  }

  if (msg.type === 'stop') {
    running = false;
    postMessage({ type: 'done', frames: frameQueue });
  }
};