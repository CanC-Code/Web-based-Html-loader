importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let segmentation;
let offscreenCanvas, offscreenCtx;
let width, height;

onmessage = async (e) => {
  const { type } = e.data;

  if (type === 'init') {
    width = e.data.width;
    height = e.data.height;
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d');

    segmentation = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    segmentation.setOptions({ modelSelection: 1 });
    await segmentation.initialize();

    postMessage({ type: 'ready' });
    return;
  }

  if (type === 'process') {
    const frame = e.data.frame;
    const imgData = new ImageData(new Uint8ClampedArray(frame.data), width, height);
    offscreenCtx.putImageData(imgData, 0, 0);

    const bitmap = offscreenCanvas.transferToImageBitmap();
    await segmentation.send({ image: bitmap });

    segmentation.onResults(results => {
      const mask = results.segmentationMask;
      offscreenCtx.clearRect(0, 0, width, height);
      offscreenCtx.drawImage(mask, 0, 0, width, height);
      offscreenCtx.globalCompositeOperation = 'source-in';
      offscreenCtx.drawImage(bitmap, 0, 0, width, height);
      offscreenCtx.globalCompositeOperation = 'source-over';

      const output = offscreenCtx.getImageData(0, 0, width, height);
      postMessage({ type: 'render', data: output.data, width, height }, [output.data.buffer]);
    });
  }
};