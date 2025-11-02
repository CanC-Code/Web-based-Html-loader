self.onmessage = e => {
  const msg = e.data;
  if(msg.type==='blend'){
    const { width, height, data } = msg;
    const frame = new Uint8ClampedArray(data);

    // minimal smoothing
    for(let i=0;i<frame.length;i+=4){
      // optional tiny alpha boost for feathering
      frame[i+3] = Math.min(255, frame[i+3]*1.05);
    }

    postMessage({type:'frame',data:frame.buffer},[frame.buffer]);
  }
};