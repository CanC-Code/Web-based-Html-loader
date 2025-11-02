// processor-worker.js

let history = [];
const FRAME_HISTORY = 2; // Number of previous frames for temporal blending

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'frame') {
    const { bitmap, mask } = msg;

    // Convert mask to ImageBitmap
    const maskBitmap = await createImageBitmap(mask);

    // Offscreen canvas for processing
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const offCtx = off.getContext('2d');

    // Draw original video frame
    offCtx.drawImage(bitmap, 0, 0);

    // Apply feathered mask
    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.filter = 'blur(2px)'; // Feathering
    offCtx.drawImage(maskBitmap, 0, 0, bitmap.width, bitmap.height);
    offCtx.restore();

    // Temporal blending
    const frameData = offCtx.getImageData(0, 0, bitmap.width, bitmap.height);
    history.push(frameData.data.slice()); // copy

    if (history.length > FRAME_HISTORY) history.shift();

    if (history.length > 1) {
      // Blend frames to reduce flicker
      const blended = new Uint8ClampedArray(frameData.data.length);
      for (let i = 0; i < blended.length; i += 4) {
        let r = 0, g = 0, b = 0, a = 0;
        history.forEach(f => {
          r += f[i];
          g += f[i+1];
          b += f[i+2];
          a += f[i+3];
        });
        const count = history.length;
        blended[i] = r / count;
        blended[i+1] = g / count;
        blended[i+2] = b / count;
        blended[i+3] = a / count;
      }
      frameData.data.set(blended);
    }

    // Convert processed frame to ImageBitmap
    const processedBitmap = await createImageBitmap(frameData);

    self.postMessage({ type: 'frame', bitmap: processedBitmap }, [processedBitmap]);

  } else if (msg.type === 'finish') {
    self.postMessage({ type: 'done' });
  }
};