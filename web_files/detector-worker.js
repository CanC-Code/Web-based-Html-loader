self.importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js');
self.importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/deeplab@0.2.2/dist/deeplab.min.js');

let model = null;

self.onmessage = async (e) => {
  const { type, frameData, width, height } = e.data;

  if(type === 'init'){
    if(model) return postMessage({ type:'ready' });
    try {
      model = await deeplab.load({ base:'pascal', quantizationBytes:2 });
      postMessage({ type:'ready' });
    } catch(err){
      postMessage({ type:'error', message: err.message });
    }
    return;
  }

  if(type === 'process'){
    if(!model) return;
    try {
      const off = new OffscreenCanvas(width, height);
      const ctx = off.getContext('2d');
      const imgData = new ImageData(new Uint8ClampedArray(frameData), width, height);
      ctx.putImageData(imgData,0,0);

      const seg = await model.segment(off);

      const mask = new Uint8ClampedArray(width*height*4);
      for(let i=0;i<width*height;i++){
        const alpha = seg.segmentationMap[i]>0?255:0;
        mask[i*4] = 255;
        mask[i*4+1] = 255;
        mask[i*4+2] = 255;
        mask[i*4+3] = alpha;
      }

      postMessage({ type:'mask', maskData: mask.buffer, width, height }, [mask.buffer]);
    } catch(err){
      postMessage({ type:'error', message: err.message });
    }
  }
};