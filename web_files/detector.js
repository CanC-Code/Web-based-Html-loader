// detector.js — main thread interface
let Detector = {
  worker: null,
  ready: false,

  async init(opts={}){
    return new Promise((resolve,reject)=>{
      if(!window.Worker){
        reject(new Error("Web Workers not supported"));
        return;
      }
      if(this.worker) this.worker.terminate();
      this.worker = new Worker('detector-worker.js');
      this.worker.onmessage = e=>{
        const {type,msg} = e.data;
        if(type==='log') console.log('[Detector]',msg);
        if(type==='ready') { this.ready=true; resolve(); }
      };
      this.worker.onerror = e=>reject(e);
      this.worker.postMessage({ type:'init', options:opts });
    });
  },

  async processFrame(frame, opts={}){
    return new Promise(resolve=>{
      if(!this.ready) return resolve(null);
      this.worker.onmessage = e=>{
        if(e.data.type==='mask'){
          const maskData = e.data.maskData;
          const width = e.data.width;
          const height = e.data.height;
          resolve({ data:maskData, width, height });
        }
      };
      this.worker.postMessage({ type:'process', frame, mode:opts.mode||'human' });
    });
  },

  applyMask(ctx, mask){
    const imgData = new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height);
    ctx.save();
    ctx.globalCompositeOperation='destination-in';
    ctx.putImageData(imgData,0,0);
    ctx.restore();
  }
};