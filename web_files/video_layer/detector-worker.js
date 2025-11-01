importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmentation = null;
let frameWidth = 0;
let frameHeight = 0;

async function initSegmentation(width, height) {
  frameWidth = width;
  frameHeight = height;

  segmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });

  segmentation.setOptions({
    modelSelection: 1,   // General model
    selfieMode: true
  });

  segmentation.onResults(onResults);

  postMessage({ type: 'ready' });
}

// Handle results from MediaPipe
function onResults(results) {
  const maskImage = results.segmentationMask;

  // Create offscreen canvas to extract mask pixels
  const tmpCanvas = new OffscreenCanvas(frameWidth, frameHeight);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(maskImage, 0, 0, frameWidth, frameHeight);

  const imageData = tmpCtx.getImageData(0, 0, frameWidth, frameHeight);
  const mask = new Uint8ClampedArray(frameWidth * frameHeight);

  for (let i = 0; i < mask.length; i++) {
    mask[i] = imageData.data[i*4]; // Use red channel as mask
  }

  postMessage(mask, [mask.buffer]);
}

// Receive messages from main thread
onmessage = async e => {
  if (e.data.type === 'init') {
    await initSegmentation(e.data.width, e.data.height);
  } else {
    // e.data is ImageData from main thread
    // Convert to ImageBitmap for MediaPipe
    createImageBitmap(e.data).then(bitmap => {
      segmentation.send({ image: bitmap });
    });
  }
};