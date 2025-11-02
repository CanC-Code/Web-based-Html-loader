export class VideoDetector {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seg = null;
    this.mask = null;
    this.running = false;
    this.onFrameCallback = null;
    this.frames = [];
  }

  async init() {
    this.seg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    this.seg.setOptions({ modelSelection: 1 });
    this.seg.onResults(r => this.mask = r.segmentationMask);
    await this.seg.initialize();
  }

  start() {
    if (!this.seg) throw new Error("Segmentation model not initialized.");
    this.running = true;
    this.frames = [];
    this._loop();
  }

  stop() {
    this.running = false;
  }

  async _loop() {
    const video = this.video;
    const canvas = this.canvas;
    const ctx = this.ctx;

    if (!this.running) return;

    const fps = 30; // we can read from video metadata if needed
    const frameDuration = 1000 / fps;

    let lastTime = performance.now();

    const processFrame = async () => {
      if (!this.running || video.paused || video.ended) return;

      const now = performance.now();
      if (now - lastTime >= frameDuration) {
        lastTime = now;

        // Send current frame to segmentation
        await this.seg.send({ image: video });

        if (!this.mask) {
          requestAnimationFrame(processFrame);
          return;
        }

        // Draw current frame
        const off = new OffscreenCanvas(canvas.width, canvas.height);
        const octx = off.getContext('2d');

        octx.clearRect(0, 0, canvas.width, canvas.height);
        octx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Feathering for smooth edges
        octx.filter = 'blur(1px)';
        octx.globalCompositeOperation = 'destination-in';
        octx.drawImage(this.mask, 0, 0, canvas.width, canvas.height);

        const frameData = octx.getImageData(0, 0, canvas.width, canvas.height);

        // Draw to visible canvas
        ctx.putImageData(frameData, 0, 0);

        // Store frame as ImageBitmap for WebCodecs
        this.frames.push(await createImageBitmap(frameData));
        if (this.onFrameCallback) this.onFrameCallback(frameData);
      }

      requestAnimationFrame(processFrame);
    };

    processFrame();
  }

  async encodeVideo() {
    if (!this.frames.length) throw new Error("No frames to encode");

    const { width, height } = this.canvas;
    const fps = 30; // match original

    // Setup WebCodecs VideoEncoder
    const chunks = [];
    const encoder = new VideoEncoder({
      output: chunk => chunks.push(chunk),
      error: e => console.error(e)
    });

    encoder.configure({
      codec: 'vp8',
      width,
      height,
      framerate: fps
    });

    for (let i = 0; i < this.frames.length; i++) {
      const frame = new VideoFrame(this.frames[i], { timestamp: i * (1000000 / fps) }); // microseconds
      encoder.encode(frame);
      frame.close();
    }

    await encoder.flush();

    // Convert chunks to Blob
    const webmChunks = chunks.map(c => new Uint8Array(c.byteLength ? c.byteLength : c.length));
    const blob = new Blob(webmChunks, { type: 'video/webm' });
    return URL.createObjectURL(blob);
  }
}