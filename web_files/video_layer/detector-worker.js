// detector-worker.js
let width = 0;
let height = 0;
let seg = null;
let maskHistory = [];
const HISTORY_LENGTH = 2; // number of previous masks for smoothing
const FEATHER_RADIUS = 5;  // pixels for edge feathering

// Initialize
self.onmessage = async e => {
  const msg = e.data;
  if(msg.type === 'init'){
    width = msg.width;
    height = msg.height;
    // Load MediaPipe SelfieSegmentation in worker context
    importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({modelSelection: 1});
    seg.onResults(results => {
      // store mask for processing
      processMask(results.segmentationMask);
    });
    self.postMessage({type:'ready'});
  } else if(msg.type === 'enqueue'){
    if(!seg) return;
    seg.send({image: msg.bitmap});
  }
};

// Process mask with feathering & temporal smoothing
function processMask(mask){
  const off = new OffscreenCanvas(width, height);
  const octx = off.getContext('2d');

  octx.clearRect(0,0,width,height);
  octx.drawImage(mask,0,0,width,height);

  const maskData = octx.getImageData(0,0,width,height);

  // Add to history
  maskHistory.push(maskData);
  if(maskHistory.length > HISTORY_LENGTH) maskHistory.shift();

  // Create blended mask
  const blended = new Uint8ClampedArray(maskData.data.length);
  for(let i=0; i<maskData.data.length; i+=4){
    let alpha = 0;
    maskHistory.forEach(mh => alpha += mh.data[i+3]/maskHistory.length);
    blended[i] = blended[i+1] = blended[i+2] = 255;
    blended[i+3] = alpha;
  }

  // Apply feathering
  const feathered = featherMask(blended, width, height, FEATHER_RADIUS);

  self.postMessage({type:'frame', data: feathered.buffer}, [feathered.buffer]);
}

// Simple Gaussian-like feathering for edges
function featherMask(data, w, h, radius){
  const out = new Uint8ClampedArray(data.length);
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      let sum=0, count=0;
      for(let dy=-radius; dy<=radius; dy++){
        for(let dx=-radius; dx<=radius; dx++){
          const nx = x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const idx = (ny*w+nx)*4+3;
          sum += data[idx];
          count++;
        }
      }
      const idx = (y*w+x)*4;
      out[idx] = out[idx+1] = out[idx+2] = 255;
      out[idx+3] = sum/count;
    }
  }
  return out;
}