self.onmessage = e => {
  const msg = e.data;
  if(msg.type === 'frame'){
    const { width, height } = msg;
    const frame = new ImageData(new Uint8ClampedArray(msg.data), width, height);

    // Optional: Feathering / edge refinement
    for(let i = 3; i < frame.data.length; i +=4){
      // alpha smoothing could go here
      frame.data[i] = frame.data[i]; // placeholder for more advanced operations
    }

    self.postMessage(frame, [frame.data.buffer]);
  } else if(msg.type === 'done'){
    self.postMessage({type:'done'});
  }
};