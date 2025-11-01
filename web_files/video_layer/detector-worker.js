importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmentation = null;

async function initSegmentation() {
  segmentation = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
  segmentation.setOptions({ modelSelection: 1, selfieMode: true });
  segmentation.onResults(onResults);
  postMessage({ type: 'ready' });
}

function onResults(results) {
  const maskImage = results.segmentationMask;
  const width = maskImage.width;
  const height = maskImage.height;
  const mask = new Uint8ClampedArray(width * height);

  for (let i = 0; i < width * height; i++) mask[i] = maskImage.data[i] * 255;

  postMessage(mask, [mask.buffer]);
}

onmessage = async e => {
  if (e.data.type === 'init') await initSegmentation();
  else {
    const frame = e.data;
    createImageBitmap(frame).then(img => segmentation.send({ image: img }));
  }
};
