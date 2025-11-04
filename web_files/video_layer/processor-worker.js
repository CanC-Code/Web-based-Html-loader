self.onmessage = e => {
  const msg = e.data;
  if(msg.type==='frame'){
    const { width, height, data } = msg;
    const frame = new Uint8ClampedArray(data);

    // Optional feathering: smooth edges dynamically
    for(let i=0;i<frame.length;i+=4){
      frame[i+3] = frame[i+3]; // preserve alpha, could enhance feather here
    }

    postMessage(frame.buffer, [frame.buffer]);
  }
};
