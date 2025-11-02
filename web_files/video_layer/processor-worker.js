self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'blend') {
    const { width, height } = msg;
    const frame = new ImageData(new Uint8ClampedArray(msg.data), width, height);
    // basic smoothing or light enhancement can happen here if needed
    postMessage({ type: 'frame', data: frame.data.buffer }, [frame.data.buffer]);
  }
};