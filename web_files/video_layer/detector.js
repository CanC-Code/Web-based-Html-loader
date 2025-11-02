// detector.js
export async function startVideoProcessing(video, canvas, ctx, frameCallback) {
  const worker = new Worker('detector-worker.js');
  const FRAME_HISTORY = 3;
  let history = [];

  // Load MediaPipe SelfieSegmentation
  const seg = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  seg.setOptions({ modelSelection: 1 });
  await seg.initialize();

  seg.onResults(results => {
    if (!results.segmentationMask) return;

    const maskCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

    const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);

    // Store history
    history.push(maskData.data);
    if (history.length > FRAME_HISTORY) history.shift();

    // Merge history for temporal AA
    const blended = new Uint8ClampedArray(maskData.data.length);
    for (let i = 0; i < maskData.data.length; i += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      history.forEach(f => { r += f[i]; g += f[i+1]; b += f[i+2]; a += f[i+3]; });
      const count = history.length;
      blended[i] = r / count;
      blended[i+1] = g / count;
      blended[i+2] = b / count;
      blended[i+3] = a / count;
    }

    // Send frame + blended mask to worker
    const offCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = offCtx.getImageData(0, 0, canvas.width, canvas.height);

    worker.postMessage({
      type: 'process',
      width: frame.width,
      height: frame.height,
      frameData: frame.data.buffer,
      maskData: blended.buffer
    }, [frame.data.buffer, blended.buffer]);
  });

  worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'frame') {
      const img = new ImageData(new Uint8ClampedArray(msg.data), canvas.width, canvas.height);
      ctx.putImageData(img, 0, 0);
      if (frameCallback) frameCallback(img);
    }
  };

  // Main loop
  function processLoop() {
    if (!video.paused && !video.ended) {
      seg.send({ image: video }).catch(() => {});
      video.requestVideoFrameCallback(processLoop);
    }
  }

  video.requestVideoFrameCallback(processLoop);
}