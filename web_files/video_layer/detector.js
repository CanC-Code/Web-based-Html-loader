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

      // Apply feathering / smoothing dynamically
      octx.filter = 'blur(1px)'; 
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(this.mask,0,0,this.canvas.width,this.canvas.height);

      const frameData = octx.getImageData(0,0,this.canvas.width,this.canvas.height);

      // Send **current frame only** to worker
      this.worker.postMessage({type:'blend',width:frameData.width,height:frameData.height,data:frameData.data.buffer},[frameData.data.buffer]);

      requestAnimationFrame(()=>this._loop());
    });
  }

  static async framesToWebM(frames,width,height){
    return new Promise(resolve=>{
      const streamCanvas = document.createElement('canvas');
      streamCanvas.width = width;
      streamCanvas.height = height;
      const ctx = streamCanvas.getContext('2d');
      const stream = streamCanvas.captureStream();
      const recorder = new MediaRecorder(stream,{mimeType:'video/webm'});
      const chunks = [];
      recorder.ondataavailable = e=>chunks.push(e.data);
      recorder.onstop = ()=>resolve(URL.createObjectURL(new Blob(chunks,{type:'video/webm'})));
      recorder.start();

      let idx=0;
      function drawNext(){
        if(idx>=frames.length){ recorder.stop(); return; }
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