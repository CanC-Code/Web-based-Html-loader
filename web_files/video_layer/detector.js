export class VideoDetector {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seg = null;
    this.mask = null;
    this.worker = null;
    this.running = false;
    this.onFrameCallback = null;
    this.history = [];
    this.FRAME_HISTORY = 3;
  }

  async init() {
    this.seg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    this.seg.setOptions({ modelSelection:1 });
    this.seg.onResults(r => this.mask = r.segmentationMask);
    await this.seg.initialize();
  }

  start() {
    if(!this.seg) throw new Error("Segmentation model not initialized.");
    if(this.worker) this.worker.terminate();

    this.worker = new Worker('detector-worker.js');
    this.running = true;

    this.worker.onmessage = e => {
      const msg = e.data;
      if(msg.type==='frame'){
        const imgData = new ImageData(new Uint8ClampedArray(msg.data), this.canvas.width, this.canvas.height);
        this.ctx.putImageData(imgData,0,0);
        if(this.onFrameCallback) this.onFrameCallback(imgData);
      }
    };

    this._loop();
  }

  stop() {
    this.running = false;
    if(this.worker) this.worker.terminate();
    this.worker = null;
  }

  _loop() {
    if(!this.running) return;
    if(this.video.paused || this.video.ended){ requestAnimationFrame(()=>this._loop()); return; }

    this.seg.send({image:this.video}).then(()=>{
      if(!this.mask){ requestAnimationFrame(()=>this._loop()); return; }

      const off = new OffscreenCanvas(this.canvas.width,this.canvas.height);
      const octx = off.getContext('2d');

      // Draw video
      octx.drawImage(this.video,0,0,this.canvas.width,this.canvas.height);

      // Auto feather alpha based on mask
      octx.globalAlpha = 1.0;
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(this.mask,0,0,this.canvas.width,this.canvas.height);

      const frameData = octx.getImageData(0,0,this.canvas.width,this.canvas.height);

      // Store frame for temporal blending
      this.history.push(frameData.data.slice());
      if(this.history.length > this.FRAME_HISTORY) this.history.shift();

      // Send blended frame to worker
      const blendData = this._temporalBlend(frameData.data);
      this.worker.postMessage({type:'blend',width:frameData.width,height:frameData.height,data:blendData.buffer},[blendData.buffer]);

      requestAnimationFrame(()=>this._loop());
    });
  }

  _temporalBlend(current) {
    const blended = new Uint8ClampedArray(current.length);
    const historyFrames = [...this.history, current];
    const count = historyFrames.length;

    for(let i=0;i<current.length;i+=4){
      let r=0,g=0,b=0,a=0;
      historyFrames.forEach(f=>{
        r+=f[i]; g+=f[i+1]; b+=f[i+2]; a+=f[i+3];
      });
      blended[i] = r/count; blended[i+1] = g/count;
      blended[i+2] = b/count; blended[i+3] = a/count;
    }
    return blended;
  }

  static async framesToWebM(frames,width,height){
    return new Promise(resolve=>{
      const stream = new MediaStream();
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      const track = canvas.captureStream().getVideoTracks()[0];
      stream.addTrack(track);
      const mediaRecorder = new MediaRecorder(stream,{mimeType:'video/webm'});
      const chunks = [];
      mediaRecorder.ondataavailable = e=>chunks.push(e.data);
      mediaRecorder.onstop = ()=>resolve(URL.createObjectURL(new Blob(chunks,{type:'video/webm'})));
      mediaRecorder.start();

      let idx=0;
      function drawNext(){
        if(idx>=frames.length){ mediaRecorder.stop(); return; }
        const img = new Image();
        img.onload=()=>{
          ctx.clearRect(0,0,width,height);
          ctx.drawImage(img,0,0,width,height);
          idx++;
          requestAnimationFrame(drawNext);
        };
        img.src=frames[idx];
      }
      drawNext();
    });
  }
}