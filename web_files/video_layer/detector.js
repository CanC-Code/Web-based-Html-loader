class VideoProcessor {
  constructor(videoElement, canvas, effect) {
    this.video = videoElement;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effect = effect;
    this.running = false;

    this.detectorWorker = new Worker('detector-worker.js');
    this.processorWorker = new Worker('processor-worker.js');

    this.currentFrame = null;

    this.detectorWorker.onmessage = e => {
      const mask = e.data;
      this.processorWorker.postMessage({ frame: this.currentFrame, mask, effect: this.effect }, [this.currentFrame.data.buffer, mask.buffer]);
    };

    this.processorWorker.onmessage = e => {
      const processedFrame = e.data;
      this.ctx.putImageData(processedFrame, 0, 0);
    };
  }

  async init() {
    return new Promise(resolve => {
      this.detectorWorker.postMessage({ type: 'init' });
      this.detectorWorker.onmessage = e => {
        if (e.data.type === 'ready') resolve();
      };
    });
  }

  start() {
    this.running = true;
    this.video.play();
    this.processLoop();
  }

  stop() {
    this.running = false;
    this.video.pause();
  }

  processLoop() {
    if (!this.running) return;
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.currentFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.detectorWorker.postMessage(this.currentFrame, [this.currentFrame.data.buffer]);
    requestAnimationFrame(() => this.processLoop());
  }
}
