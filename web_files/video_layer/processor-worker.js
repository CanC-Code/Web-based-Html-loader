importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmenter;
let width = 0, height = 0;
let offCanvas, offCtx;

onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    width = e.data.width;
    height = e.data.height;
    offCanvas = new OffscreenCanvas(width, height);
    offCtx = offCanvas.getContext('2d');

    segmenter = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    segmenter.setOptions({ modelSelection: 1 });
    segmenter.onResults(results => handleResults(results));

    postMessage({ type: 'ready' });
    return;
  }

  if (type === 'frame' && segmenter) {
    const img = new ImageData(new Uint8ClampedArray(data.data), width, height);
    offCtx.putImageData(img, 0, 0);
    await segmenter.send({ image: offCanvas });
  }
};

function handleResults(results) {
  const mask = results.segmentationMask;
  offCtx.save();
  offCtx.clearRect(0, 0, width, height);
  offCtx.drawImage(mask, 0, 0, width, height);
  offCtx.globalCompositeOperation = 'source-in';
  offCtx.drawImage(results.image, 0, 0, width, height);
  offCtx.restore();

  const output = offCtx.getImageData(0, 0, width, height);
  postMessage({ type: 'render', data: output.data, width, height }, [output.data.buffer]);
}