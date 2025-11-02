const FRAME_HISTORY = 2; // previous frames to blend for smooth edges
let history = [];

function smoothEdges(frameData, width, height) {
  // Very simple edge feathering: soften alpha along edges
  const alphaThreshold = 20;
  for(let y=1; y<height-1; y++){
    for(let x=1; x<width-1; x++){
      const idx = (y*width + x)*4 + 3; // alpha channel
      if(frameData[idx] < 255){
        // average neighboring alpha for feathering
        let sum = 0, count = 0;
        for(let dy=-1; dy<=1; dy++){
          for(let dx=-1; dx<=1; dx++){
            const nidx = ((y+dy)*width + (x+dx))*4 + 3;
            sum += frameData[nidx];
            count++;
          }
        }
        frameData[idx] = Math.min(255, Math.max(frameData[idx], sum / count));
      }
    }
  }
  return frameData;
}

self.onmessage = e => {
  const msg = e.data;

  if(msg.type === 'frame'){
    const { width, height } = msg;
    let frameData = new Uint8ClampedArray(msg.data);

    // Apply edge feathering
    frameData = smoothEdges(frameData, width, height);

    // Add frame to history
    history.push(frameData);
    if(history.length > FRAME_HISTORY) history.shift();

    // Blend with previous frames to reduce flicker
    if(history.length > 1){
      const blended = new Uint8ClampedArray(frameData.length);
      for(let i=0; i<frameData.length; i+=4){
        let r=0,g=0,b=0,a=0;
        history.forEach(f=>{
          r += f[i]; g+=f[i+1]; b+=f[i+2]; a+=f[i+3];
        });
        const count = history.length;
        blended[i] = r/count;
        blended[i+1] = g/count;
        blended[i+2] = b/count;
        blended[i+3] = a/count;
      }
      frameData = blended;
    }

    self.postMessage(frameData.buffer, [frameData.buffer]);
  } else if(msg.type === 'done'){
    self.postMessage({type:'done'});
    history = [];
  }
};