class Detector{
  static async init(model='selfie'){
    if(model==='selfie'){
      const seg = new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
      seg.setOptions({modelSelection:1});
      await seg.initialize();
      return new SelfieDetector(seg);
    } else if(model==='bodypix'){
      const net = await bodyPix.load();
      return new BodyPixDetector(net);
    }
  }
}

class SelfieDetector{
  constructor(seg){this.seg=seg;}
  async getMask(video){
    return new Promise(resolve=>{
      this.seg.onResults(results=>resolve(results.segmentationMask));
      this.seg.send({image:video});
    });
  }
}

class BodyPixDetector{
  constructor(net){this.net=net;}
  async getMask(video){
    const segmentation = await this.net.segmentPerson(video,{internalResolution:'medium',segmentationThreshold:0.7});
    const maskCanvas = new OffscreenCanvas(video.videoWidth,video.videoHeight);
    const ctx = maskCanvas.getContext('2d');
    const imgData = ctx.createImageData(video.videoWidth,video.videoHeight);
    for(let i=0;i<segmentation.data.length;i++){
      const alpha = segmentation.data[i]?255:0;
      imgData.data[i*4+0]=0;
      imgData.data[i*4+1]=0;
      imgData.data[i*4+2]=0;
      imgData.data[i*4+3]=alpha;
    }
    ctx.putImageData(imgData,0,0);
    return maskCanvas;
  }
}