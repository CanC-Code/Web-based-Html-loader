// detector-worker.js
self.importScripts(
  "https://docs.opencv.org/4.x/opencv.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js"
);

let ready = false;
let mpSeg = null;
let prevGray = null;

cv['onRuntimeInitialized'] = () => {
  ready = true;
  postMessage({ type: "log", msg: "OpenCV ready in worker" });
};

// Initialize MediaPipe SelfieSegmentation
function initSegmentation() {
  return new Promise(resolve => {
    mpSeg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    mpSeg.setOptions({ modelSelection: 1 });
    mpSeg.onResults(results => {
      // send mask back
      self.postMessage({ type: "mask", maskData: results.segmentationMask });
    });
    resolve();
  });
}

self.onmessage = async e => {
  const { type, frame, mode } = e.data;
  if (type !== "process" || !ready) return;

  try {
    // Convert frame to OpenCV mat
    const src = cv.matFromImageData(frame);
    let outMat = new cv.Mat();
    
    if (mode === "motion") {
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (prevGray) {
        cv.absdiff(gray, prevGray, outMat);
        cv.threshold(outMat, outMat, 25, 255, cv.THRESH_BINARY);
        cv.medianBlur(outMat, outMat, 5);
      }
      if (prevGray) prevGray.delete();
      prevGray = gray.clone();
      gray.delete();
    } else if (mode === "all") {
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.Canny(gray, outMat, 80, 160);
      gray.delete();
    } else if (mode === "human" || mode === "remove" || mode === "blur") {
      if (!mpSeg) await initSegmentation();
      // Send frame to MediaPipe segmentation
      const imgBitmap = await createImageBitmap(frame);
      mpSeg.send({ image: imgBitmap });
      src.delete();
      return; // mask will be returned async via mpSeg.onResults
    }

    // Return mask for OpenCV modes
    postMessage({
      type: "mask",
      maskData: outMat.data.slice(0),
      width: outMat.cols,
      height: outMat.rows
    });
    src.delete(); outMat.delete();
  } catch (err) {
    postMessage({ type: "log", msg: "Worker error: " + err });
  }
};