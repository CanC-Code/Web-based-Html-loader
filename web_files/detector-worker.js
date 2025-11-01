// detector-worker.js — AI-powered frame processor
self.importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let ready = false;

// Initialize MediaPipe
function initSegmentation(){
  if(seg) return;
  seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
  seg.setOptions({ modelSelection: 1 });
  seg.onResults(results => {
    if(!self.currentFrame) return;

    const { effect, exclude } = self.currentOptions;
    const width = self.currentFrame.width;
    const height = self.currentFrame.height;

    // Create an ImageBitmap from the segmentation mask
    createImageBitmap(results.segmentationMask).then(maskBitmap=>{
      // Draw to OffscreenCanvas
      const off = new OffscreenCanvas(width, height);
      const ctx = off.getContext('2d');

      ctx.clearRect(0,0,width,height);
      ctx.drawImage(self.currentFrame,0,0,width,height);

      ctx.save();
      if(effect==='remove'){
        ctx.globalCompositeOperation = 'destination-in';
      } else if(effect==='blur'){
        ctx.filter = 'blur(10px)';
        ctx.globalCompositeOperation = 'destination-over';
      }

      // Exclusion: skip specific regions (fan) — simple color-based placeholder
      if(exclude==='fan'){
        // Example: mask upper 20% of canvas
        ctx.fillStyle='black';
        ctx.fillRect(0,0,width,height*0.2);
      }

      ctx.drawImage(maskBitmap,0,0,width,height);
      ctx.restore();

      // Send back as ImageBitmap for main thread
      off.convertToBlob().then(blob=>{
        createImageBitmap(blob).then(finalBitmap=>{
          self.postMessage({type:'mask', mask: finalBitmap}, [finalBitmap]);
        });
      });
    });
  });

  ready = true;
}

self.onmessage = e=>{
  const data = e.data;
  if(data.type==='init'){
    initSegmentation();
    self.postMessage({type:'log', msg:'Worker ready'});
  } else if(data.type==='process'){
    if(!ready) return;

    const { frame, effect, exclude, width, height } = data;

    // Convert frame to ImageBitmap for MediaPipe
    createImageBitmap(frame).then(bitmap=>{
      self.currentFrame = bitmap;
      self.currentOptions = { effect, exclude };
      seg.send({image: bitmap});
    });
  }
};