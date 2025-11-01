// detector.js
// Full VideoProcessor: captures frames, sends to detector-worker, receives mask, sends to processor-worker,
// draws processed frames to canvas and handles MediaRecorder / start-stop / pause / quality scaling.

class VideoProcessor {
  constructor(videoElem, canvasElem, effect='none', quality=1) {
    this.video = videoElem;            // HTMLVideoElement (created by caller)
    this.canvas = canvasElem;          // Output canvas (visible and recorded)
    this.ctx = this.canvas.getContext('2d', {alpha:true});
    this.effect = effect;
    this.quality = quality;            // scaling factor 0.25..1
    this.running = false;
    this.frameId = 0;
    this.pendingFrames = new Map();    // frameId -> ImageData (to be transferred to processor)
    this.detector = new Worker('detector-worker.js');
    this.processor = new Worker('processor-worker.js');

    // Bind handlers
    this.detector.onmessage = (ev) => this._onDetectorMessage(ev);
    this.processor.onmessage = (ev) => this._onProcessorMessage(ev);

    this.onFinish = null; // callback
  }

  async init() {
    // Prepare worker with target canvas dimensions (the processing width/height = canvas size * quality)
    const targetW = Math.max(1, Math.round(this.canvas.width * this.quality));
    const targetH = Math.max(1, Math.round(this.canvas.height * this.quality));

    return new Promise((resolve) => {
      const onReady = (ev) => {
        if (ev.data && ev.data.type === 'ready') {
          this.detector.removeEventListener('message', onReady);
          resolve();
        }
      };
      this.detector.addEventListener('message', onReady);
      this.detector.postMessage({ type: 'init', width: targetW, height: targetH });
    });
  }

  start() {
    if (!this.video) throw new Error('No source video element');
    this.running = true;
    this.video.play().catch(()=>{});
    this._frameLoop();
    // Hook for automatic stop when video ends
    this.video.onended = () => this._onVideoEnded();
  }

  pause() {
    this.running = false;
    this.video.pause();
  }

  stop() {
    this.running = false;
    this.video.pause();
    // Clear pending frames
    this.pendingFrames.clear();
    if (this.onFinish) this.onFinish();
  }

  _onVideoEnded() {
    // Wait until pending frames processed then stop
    // We'll stop after a small grace period to allow final frames to complete
    setTimeout(() => {
      this.stop();
    }, 300);
  }

  async _frameLoop() {
    // Use requestVideoFrameCallback when available for precise frame sync
    if (!this.running) return;
    const doFrame = async () => {
      if (!this.running) return;
      // Draw current video frame to canvas (visible)
      try {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      } catch (err) {
        // drawing may fail for cross-origin video; bail gracefully
        console.error('DrawImage failed:', err);
        this.stop();
        return;
      }

      // Capture an ImageData copy at display size
      const displayImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

      // Create a scaled ImageBitmap for the detector to match the worker target size (quality)
      const targetW = Math.max(1, Math.round(this.canvas.width * this.quality));
      const targetH = Math.max(1, Math.round(this.canvas.height * this.quality));

      // Create an OffscreenCanvas to scale the frame for detector
      const off = new OffscreenCanvas(targetW, targetH);
      const offCtx = off.getContext('2d');
      offCtx.putImageData(displayImageData, 0, 0); // put original
      // If target different, draw scaled
      if (targetW !== this.canvas.width || targetH !== this.canvas.height) {
        const tmp = new OffscreenCanvas(this.canvas.width, this.canvas.height);
        tmp.getContext('2d').putImageData(displayImageData, 0, 0);
        offCtx.drawImage(tmp, 0, 0, targetW, targetH);
      }

      // createImageBitmap is transferable and efficient
      const bitmap = await off.transferToImageBitmap();

      // generate a frame id and keep the original display ImageData for later processor use
      const id = ++this.frameId;
      this.pendingFrames.set(id, displayImageData);

      // send bitmap with id to detector
      try {
        this.detector.postMessage({ frameId: id, bitmap }, [bitmap]);
      } catch (err) {
        // Some browsers require transferable in array; if fails, send without transfer
        this.detector.postMessage({ frameId: id, bitmap });
      }

      // schedule next frame: prefer requestVideoFrameCallback
      if (this.video.requestVideoFrameCallback) {
        this.video.requestVideoFrameCallback(() => this._frameLoop());
      } else {
        requestAnimationFrame(() => this._frameLoop());
      }
    };

    // Kick off first call
    if (this.video.requestVideoFrameCallback) {
      this.video.requestVideoFrameCallback(() => doFrame());
    } else {
      requestAnimationFrame(() => doFrame());
    }
  }

  _onDetectorMessage(ev) {
    const data = ev.data;
    // expected { frameId, mask } or { type:'ready' }
    if (!data) return;
    if (data.type === 'ready') {
      // worker ready
      return;
    }
    const { frameId, mask } = data;
    if (!this.pendingFrames.has(frameId)) {
      // frame expired or already processed
      return;
    }

    // Retrieve the ImageData (display size) and send to processor along with mask
    const imageData = this.pendingFrames.get(frameId);
    // We will transfer the imageData.data.buffer to the worker for speed.
    try {
      this.processor.postMessage({ frameId, frame: imageData, mask, effect: this.effect }, [imageData.data.buffer, mask.buffer]);
    } catch (err) {
      // If transfer fails, send without transfer
      this.processor.postMessage({ frameId, frame: imageData, mask, effect: this.effect });
    }

    // Remove from map — ownership of buffer transferred (or the copy was sent)
    this.pendingFrames.delete(frameId);
  }

  _onProcessorMessage(ev) {
    const processed = ev.data;
    // expected ImageData returned (frameId optional)
    if (!processed) return;
    // processed is ImageData
    try {
      this.ctx.putImageData(processed, 0, 0);
    } catch (err) {
      console.error('putImageData failed', err);
    }
  }

  setEffect(effect) { this.effect = effect; }
  setQuality(q) { this.quality = q; }
}

// Expose to global for the page script
window.VideoProcessor = VideoProcessor;

// UI glue after script loads
(function attachUI(){
  // Wait for DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    const videoInput = document.getElementById('videoInput');
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const effectSelect = document.getElementById('effectSelect');
    const qualityRange = document.getElementById('qualityRange');
    const qualityLabel = document.getElementById('qualityLabel');
    const status = document.getElementById('status');
    const fpsLabel = document.getElementById('fps');
    const canvas = document.getElementById('outputCanvas');

    let sourceVideo = null;
    let processor = null;
    let recorder = null;
    let chunks = [];

    videoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (sourceVideo) {
        sourceVideo.src = '';
        sourceVideo.remove();
      }
      sourceVideo = document.createElement('video');
      sourceVideo.playsInline = true;
      sourceVideo.muted = true;
      sourceVideo.src = URL.createObjectURL(file);
      sourceVideo.load();
      sourceVideo.onloadedmetadata = () => {
        canvas.width = sourceVideo.videoWidth;
        canvas.height = sourceVideo.videoHeight;
        status.textContent = `Loaded: ${file.name} (${canvas.width}x${canvas.height})`;
      };
    });

    startBtn.addEventListener('click', async () => {
      if (!sourceVideo) { alert('Select a video first'); return; }
      startBtn.disabled = true; pauseBtn.disabled = false; stopBtn.disabled = false;
      const quality = parseFloat(qualityRange.value);
      qualityLabel.textContent = quality === 1 ? 'Full' : `${Math.round(quality*100)}%`;
      const effect = effectSelect.value;

      // Create & init processor
      processor = new VideoProcessor(sourceVideo, canvas, effect, quality);
      await processor.init();

      // Setup MediaRecorder on canvas stream
      chunks = [];
      const stream = canvas.captureStream(30);
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      } catch (err) {
        // Fallback to default codecs
        recorder = new MediaRecorder(stream);
      }
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
      recorder.onstop = () => { 
        if (chunks.length > 0) downloadBtn.disabled = false;
        status.textContent = 'Recording stopped.';
      };

      processor.onFinish = () => {
        recorder.stop();
        status.textContent = 'Processing complete.';
      };

      recorder.start(100); // collect in small slices
      processor.start();
      status.textContent = 'Processing...';
    });

    pauseBtn.addEventListener('click', () => {
      if (!processor) return;
      if (processor.running) {
        processor.pause();
        pauseBtn.textContent = 'Resume';
        status.textContent = 'Paused';
      } else {
        processor.start();
        pauseBtn.textContent = 'Pause';
        status.textContent = 'Processing...';
      }
    });

    stopBtn.addEventListener('click', () => {
      if (!processor) return;
      processor.stop();
      startBtn.disabled = false; pauseBtn.disabled = true; stopBtn.disabled = true;
      status.textContent = 'Stopped';
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    });

    downloadBtn.addEventListener('click', () => {
      if (chunks.length === 0) { alert('No processed video recorded'); return; }
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed_video.webm';
      a.click();
    });

    effectSelect.addEventListener('change', () => {
      if (processor) processor.setEffect(effectSelect.value);
    });
    qualityRange.addEventListener('input', () => {
      qualityLabel.textContent = qualityRange.value === '1' ? 'Full' : `${Math.round(qualityRange.value*100)}%`;
      if (processor) processor.setQuality(parseFloat(qualityRange.value));
    });
  });
})();