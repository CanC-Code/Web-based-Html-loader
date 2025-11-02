// processor-worker.js

// Number of previous frames to blend for temporal smoothing
const FRAME_HISTORY = 3;
let history = [];

self.onmessage = e => {
  const msg = e.data;

  if(msg.type === 'frame') {
    const { width, height, data } = msg;
    const frameData = new Uint8ClampedArray(data);

    // Store current frame in history
    history.push(frameData);
    if(history.length > FRAME_HISTORY) history.shift();

    // Initialize blended frame
    const blended = new Uint8ClampedArray(frameData.length);

    // Blend current and previous frames to smooth edges
    for(let i = 0; i < frameData.length; i += 4){
      let r=0, g=0, b=0, a=0;
      history.forEach(f => {
        r += f[i];
        g += f[i+1];
        b += f[i+2];
        a += f[i+3];
      });
      const count = history.length;
      blended[i]   = r / count;
      blended[i+1] = g / count;
      blended[i+2] = b / count;
      blended[i+3] = a / count;
    }

    // Send the blended frame back to main thread
    postMessage(blended.buffer, [blended.buffer]);

  } else if(msg.type === 'done') {
    // Reset history when processing is complete
    history = [];
    postMessage({type:'done'});
  }
};