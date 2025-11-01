// detector-worker.js — AI-powered frame processor with focus refinement
self.importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let ready = false;

// Accumulated mask to reinforce consistent foreground
let accumMask = null;
let frameCount = 0;

// Refinement parameters
const swayAlpha = 0.3; // how strongly new frames affect accumulated mask
const minFrames = 3;   // wait this many frames before stabilization

function initSegmentation(){
  if(seg) return;
  seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  seg.setOptions({ modelSelection: 1 });
  seg.onResults(results => {
    if(!self.currentFrame) return;

    const width = self.currentFrame.width;
    const height = self.currentFrame.height;

    // Convert mask to ImageData
    const offMask = new OffscreenCanvas(width, height);
    const ctxMask = offMask.getContext('2d');
    ctxMask.drawImage(results.segmentationMask, 0, 0, width, height);
    const maskData = ctxMask.getImageData(0,0,width,height);

    // Initialize accumulated mask if first frame
    if(!accumMask){
      accumMask = new Float32Array(width*height);
      for(let i=0;i<accumMask.length;i++){
        accumMask[i] = maskData.data[i*4]/255; // grayscale alpha
      }
    } else {
      // Refine mask with sway pattern
      for(let i=0;i<accumMask.length;i++){
        const newVal = maskData.data[i*4]/255;
        accumMask[i] = swayAlpha*newVal + (1-swayAlpha)*accumMask[i];
      }
    }
    frameCount++;

    // Apply refined mask to frame
    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext('2d');
    ctx.drawImage(self.currentFrame,0,0,width,height);

    const imgData = ctx.getImageData(0,0,width,height);
    const data = imgData.data;
    for(let i=0;i<accumMask.length;i++){
      const alpha = frameCount >= minFrames ? accumMask[i] : 1; // ignore sway first few frames
      // Apply mask alpha
      data[i*4+0] *= alpha;
      data[i*4+1] *= alpha;
      data[i*4+2] *= alpha;
    }
    ctx.putImageData(imgData,0,0);

    off.convertToBlob().then(blob=>{
      createImageBitmap(blob).then(finalBitmap=>{
        self.postMessage({type:'mask', mask: finalBitmap}, [finalBitmap]);
      });
    });
  });

  ready = true;
}

self.onmessage = e=>{
  const data = e.data;
  if(data.type==='init'){
    accumMask = null;
    frameCount = 0;
    initSegmentation();
    self.postMessage({type:'log', msg:'Worker ready'});
  } else if(data.type==='process'){
    if(!ready) return;
    const { frame } = data;

    // Convert frame to ImageBitmap for MediaPipe
    createImageBitmap(frame).then(bitmap=>{
      self.currentFrame = bitmap;
      seg.send({image: bitmap});
    });
  }
};