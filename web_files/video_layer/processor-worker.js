// Worker: apply mask to frame for perfect cutout
self.onmessage = e => {
  const msg = e.data;

  if(msg.type === 'frame') {
    const { width, height, data, mask } = msg;
    const frame = new Uint8ClampedArray(data);
    const alphaMask = new Uint8ClampedArray(mask);

    for(let i=0;i<frame.length;i+=4){
      frame[i+3] = alphaMask[i]; // enforce alpha from mask
    }

    postMessage({ type: 'frame', data: frame.buffer }, [frame.buffer]);

  } else if(msg.type === 'finish') {
    postMessage({ type: 'done' });
  }
};