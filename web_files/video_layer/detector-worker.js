importScripts('opencv.js');

self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'detect') {
    const { width, height, data } = msg;
    const frame = new cv.Mat(height, width, cv.CV_8UC4, new Uint8Array(data));
    // Placeholder: apply OpenCV processing for motion/edge detection
    // For now, just pass through
    const output = new Uint8ClampedArray(frame.data);
    frame.delete();
    postMessage({ type: 'mask', data: output.buffer }, [output.buffer]);
  }
};