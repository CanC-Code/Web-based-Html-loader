// detector-worker.js

// Multi-frame blending and frame processing
self.onmessage = e => {
  const msg = e.data;
  if (msg.type !== 'process') return;

  const { width, height, frameData, maskData } = msg;

  const frame = new Uint8ClampedArray(frameData);
  const mask = new Uint8ClampedArray(maskData);

  // Apply mask to frame
  for (let i = 0; i < frame.length; i += 4) {
    const alpha = mask[i+3] / 255; // Use alpha channel from mask
    frame[i] = frame[i] * alpha;
    frame[i+1] = frame[i+1] * alpha;
    frame[i+2] = frame[i+2] * alpha;
    frame[i+3] = 255;
  }

  // Post final blended frame
  self.postMessage({ type: 'frame', data: frame.buffer }, [frame.buffer]);
};