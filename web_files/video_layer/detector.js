export class VideoDetector {
  constructor(video, canvas, featherSlider=null) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.featherSlider = featherSlider;
    this.seg = null;
    this.mask = null;
    this.worker = null;
    this.running = false;
    this.onFrameCallback = null;
  }

  async init(modelSelection=1) {
    this.seg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    this.seg.setOptions({ modelSelection });
    this.seg.onResults(r => this.mask = r.segmentationMask);
    await this.seg.initialize();
  }

  start() {
    if (!this.seg) throw new Error("Segmentation model not initialized.");
    if (this.worker) this.worker.terminate();
    this.worker = new Worker('detector-worker.js');
    this.running = true;

    this.worker.onmessage = e => {
      const msg = e.data;
      if (msg.type === 'frame') {
        const imgData = new ImageData(new Uint8ClampedArray(msg.data), this.canvas.width, this.canvas.height);
        this.ctx.putImageData(imgData, 0, 0);
        if (this.onFrameCallback) this.onFrameCallback(imgData);
      }
    };

    this._loop();
  }

  stop() {
    this.running = false;
    if(this.worker) this.worker.terminate();
    this.worker = null;
  }

  setFeather(value) {
    if (this.featherSlider) this.featherSlider.value = value;
  }

  _loop() {
    if (!this.running) return;
    if (this.video.paused || this.video.ended) {
      requestAnimationFrame(() => this._loop());
      return;
    }

    this.seg.send({ image: this.video }).then(() => {
      if(!this.mask) return requestAnimationFrame(() => this._loop());
      const off = new OffscreenCanvas(this.canvas.width, this.canvas.height);
      const octx = off.getContext('2d');
      octx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      octx.globalCompositeOperation = 'destination-in';
      octx.drawImage(this.mask, 0, 0, this.canvas.width, this.canvas.height);

      const frameData = octx.getImageData(0,0,this.canvas.width,this.canvas.height);
      const feather = this.featherSlider ? parseInt(this.featherSlider.value) : 5;

      this.worker.postMessage({
        type: 'blend',
        width: frameData.width,
        height: frameData.height,
        data: frameData.data.buffer,
        feather
      }, [frameData.data.buffer]);

      requestAnimationFrame(() => this._loop());
    });
  }
}