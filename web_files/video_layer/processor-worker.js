importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js');

let selfieSeg;
self.onerror = e => postMessage({ type: 'error', message: e.message });

async function initSegmentation() {
  selfieSeg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  selfieSeg.setOptions({ modelSelection: 1 });
  await selfieSeg.initialize();
}

initSegmentation();

onmessage = async e => {
  const msg = e.data;
  if (msg.type === 'process') {
    if (!selfieSeg) {
      postMessage({ type: 'error', message: 'Segmentation model not initialized.' });
      return;
    }
    try {
      const { width, height } = msg;
      const imgData = new ImageData(new Uint8ClampedArray(msg.data), width, height);
      const off = new OffscreenCanvas(width, height);
      const ctx = off.getContext('2d');
      ctx.putImageData(imgData, 0, 0);

      const results = await selfieSeg.send({ image: off });
      const mask = results.segmentationMask;

      const comp = new OffscreenCanvas(width, height);
      const cctx = comp.getContext('2d');
      cctx.drawImage(off, 0, 0);
      cctx.globalCompositeOperation = 'destination-in';
      cctx.drawImage(mask, 0, 0, width, height);

      const final = cctx.getImageData(0, 0, width, height);
      postMessage({ type: 'frame', data: final.data.buffer }, [final.data.buffer]);
    } catch (err) {
      postMessage({ type: 'error', message: err.message });
    }
  }
};