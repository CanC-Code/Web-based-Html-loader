let Detector = {
  worker: null,
  ready: false,

  async init(){
    if(!this.worker){
      this.worker = new Worker("detector-worker.js");
      this.ready = true;
    }
  },

  async processFrame(frame){
    if(!this.ready) return null;
    return new Promise(resolve => {
      this.worker.onmessage = e => {
        if(e.data.type === "mask"){
          resolve({
            data: e.data.maskData,
            width: e.data.width,
            height: e.data.height
          });
        } else resolve(null);
      };
      this.worker.postMessage({ type: "process", frame });
    });
  },

  applyMask(ctx, mask){
    if(!mask) return;
    const imgData = new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height);
    ctx.putImageData(imgData, 0, 0);
  }
};