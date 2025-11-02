const FRAME_HISTORY = 3;
let history = [];

self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'blend') {
    const { width, height, data, feather } = msg;
    const frameData = new Uint8ClampedArray(data);

    // Store history
    history.push(frameData);
    if (history.length > FRAME_HISTORY) history.shift();

    // Blend frames for temporal anti-aliasing
    const blended = new Uint8ClampedArray(frameData.length);
    for (let i = 0; i < frameData.length; i += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      history.forEach(f => {
        r += f[i]; g += f[i + 1]; b += f[i + 2]; a += f[i + 3];
      });
      const count = history.length;
      blended[i] = r / count;
      blended[i + 1] = g / count;
      blended[i + 2] = b / count;
      blended[i + 3] = a / count;
    }

    // Optional feathering
    if (feather > 0) {
      for (let i = 3; i < blended.length; i += 4) {
        blended[i] = blended[i] * 0.95 + 255 * (feather / 20);
      }
    }

    postMessage({ type: 'frame', data: blended.buffer }, [blended.buffer]);
  }
};