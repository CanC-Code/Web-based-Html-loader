self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'blend') {
    const { width, height } = msg;
    const data = new Uint8ClampedArray(msg.data);
    // optional simple smoothing
    for (let i = 0; i < data.length; i += 4) {
      // you could apply light postprocessing here
    }
    postMessage({ type: 'frame', data: data.buffer }, [data.buffer]);
  }
};