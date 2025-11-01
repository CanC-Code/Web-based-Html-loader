importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmentation = null;
let frameWidth = 0, frameHeight = 0;

async function initSegmentation(width, height) {
  frameWidth = width;
  frameHeight = height;
  segmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  segmentation.setOptions({ modelSelection: 1, selfieMode: true });
  segmentation.onResults(onResults);
  postMessage({ type: 'ready' });
}

function onResults(results) {
  const maskImage = results.segmentationMask;
  const tmpCanvas = new OffscreenCanvas(frameWidth, frameHeight);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.drawImage(maskImage, 0, 0, frameWidth, frameHeight);
  const imageData = tmpCtx.getImageData(0, 0, frameWidth, frameHeight);
  const mask = new Uint8ClampedArray(frameWidth * frameHeight);
  for (let i = 0; i < mask.length; i++) mask[i] = imageData.data[i*4];
  postMessage(mask, [mask.buffer]);
}

onmessage = async e => {
  if (e.data.type === 'init') await initSegmentation(e.data.width, e.data.height);
  else { createImageBitmap(e.data).then(img => segmentation.send({ image: img })); }
};