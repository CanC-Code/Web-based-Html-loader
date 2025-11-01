// detector-worker.js — AI background processor using MediaPipe
importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg = null;
let ready = false;
let currentMode = 'remove';

self.onmessage = async (e) => {
  const { type, frame, mode } = e.data;

  if(type === 'init'){
    currentMode = mode || 'remove';
    seg = new SelfieSegmentation({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({ modelSelection: 1 });
    seg.onResults(results => {
      const maskCanvas = new OffscreenCanvas(frame.width, frame.height);
      const ctx = maskCanvas.getContext('2d');
      ctx.clearRect(0,0,frame.width,frame.height);

      if(currentMode === 'remove'){
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(results.segmentationMask, 0,0,frame.width,frame.height);
      } else if(currentMode === 'blur'){
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(frame, 0,0,frame.width,frame.height);
        ctx.globalAlpha = 1;
        ctx.filter = 'blur(15px)';
        ctx.drawImage(results.segmentationMask, 0,0,frame.width,frame.height);
      }

      maskCanvas.convertToBlob({type:'image/png'}).then(blob=>{
        self.postMessage({ type:'mask', blob }, [blob]);
      });
    });
    ready = true;
    self.postMessage({ type:'ready' });
  }

  if(type === 'process' && ready){
    currentMode = mode || currentMode;
    seg.send({ image: frame });
  }
};