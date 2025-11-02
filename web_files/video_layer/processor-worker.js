let history = [];
const FRAME_HISTORY = 2;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'frame') {
    const { bitmap, mask } = msg;

    const maskBitmap = await createImageBitmap(mask);
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const offCtx = off.getContext('2d');

    offCtx.drawImage(bitmap, 0, 0);

    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.filter = 'blur(2px)'; // automated feathering
    offCtx.drawImage(maskBitmap, 0, 0, bitmap.width, bitmap.height);
    offCtx.restore();

    const frameData = offCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    history.push(frameData.data.slice());
    if (history.length > FRAME_HISTORY) history.shift();

    if (history.length > 1) {
      const blended = new Uint8ClampedArray(frameData.data.length);
      for (let i = 0; i < blended.length; i += 4) {
        let r = 0, g = 0, b = 0, a = 0;
        history.forEach(f => { r += f[i]; g += f[i+1]; b += f[i+2]; a += f[i+3]; });
        const count = history.length;
        blended[i] = r / count;
        blended[i+1] = g / count;
        blended[i+2] = b / count;
        blended[i+3] = a / count;
      }
      frameData.data.set(blended);
    }

    const processedBitmap = await createImageBitmap(frameData);
    self.postMessage({ type: 'frame', bitmap: processedBitmap }, [processedBitmap]);
  } else if (msg.type === 'finish') {
    self.postMessage({ type: 'done' });
  }
};