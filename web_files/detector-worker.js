// detector-worker.js — AI processing
self.importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');

let seg=null;
let mode='human';

self.onmessage = async e=>{
  const {type, frame, options, mode:msgMode} = e.data;

  if(type==='init'){
    mode = options?.mode || 'human';
    seg = new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
    seg.setOptions({modelSelection:1});
    seg.onResults(results=>{
      self.postMessage({ type:'mask', maskData:results.segmentationMask?.data,
        width:results.segmentationMask?.width,
        height:results.segmentationMask?.height });
    });
    self.postMessage({ type:'ready' });
  }

  if(type==='process' && seg){
    mode = msgMode||mode;
    const imgBitmap = await createImageBitmap(frameToCanvas(frame));
    seg.send({image: imgBitmap});
  }
};

// Helper to convert ImageData to OffscreenCanvas
function frameToCanvas(frame){
  const c=new OffscreenCanvas(frame.width,frame.height);
  const ctx=c.getContext('2d');
  ctx.putImageData(frame,0,0);
  return c;
}