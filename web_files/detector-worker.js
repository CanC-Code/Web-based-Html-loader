// detector-worker.js — threaded AI processing
importScripts("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js");

let seg = null;
let ready = false;

onmessage = async (e) => {
  const { type, frame, mode } = e.data;
  if (type !== "process") return;

  try {
    if (!seg) {
      seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
      seg.setOptions({ modelSelection: 1 });
      ready = true;
      postMessage({ type: "log", msg: "MediaPipe initialized in worker" });
    }

    // Convert ImageBitmap to canvas
    const off = new OffscreenCanvas(frame.width, frame.height);
    const ctx = off.getContext("2d");
    ctx.drawImage(frame, 0, 0, frame.width, frame.height);

    let maskData = null;

    await new Promise((resolve) => {
      seg.onResults((results) => {
        const maskCanvas = new OffscreenCanvas(frame.width, frame.height);
        const mctx = maskCanvas.getContext("2d");
        mctx.drawImage(results.segmentationMask, 0, 0, frame.width, frame.height);

        const imgData = mctx.getImageData(0, 0, frame.width, frame.height);
        if (mode === "blur") {
          // optional: simple blur by canvas filter
          mctx.filter = 'blur(8px)';
          mctx.drawImage(results.segmentationMask, 0, 0, frame.width, frame.height);
        }
        maskData = imgData.data;
        postMessage({ type: "mask", maskData, width: imgData.width, height: imgData.height });
        resolve();
      });
      seg.send({ image: off });
    });
  } catch (err) {
    postMessage({ type: "log", msg: "Worker error: " + err });
  }
};