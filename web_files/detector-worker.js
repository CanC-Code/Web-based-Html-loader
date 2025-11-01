// detector-worker.js
self.importScripts(
  "https://docs.opencv.org/4.x/opencv.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js"
);

let ready = false;
let mpSeg = null;

cv['onRuntimeInitialized'] = () => {
  ready = true;
  postMessage({ type: "log", msg: "OpenCV ready in worker" });
};

function initSegmentation() {
  return new Promise(resolve => {
    if (mpSeg) return resolve();
    mpSeg = new SelfieSegmentation({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    mpSeg.setOptions({ modelSelection: 1 });
    mpSeg.onResults(results => {
      // send mask back as ImageBitmap for blur/human modes
      createImageBitmap(results.segmentationMask).then(maskBitmap => {
        self.postMessage({ type: "mask", maskData: maskBitmap }, [maskBitmap]);
      });
    });
    resolve();
  });
}

self.onmessage = async e => {
  const { type, frame, mode } = e.data;
  if (type !== "process" || !ready) return;

  try {
    const src = cv.matFromImageData(frame);

    if (mode === "motion") {
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (self.prevGray) {
        const diff = new cv.Mat();
        cv.absdiff(gray, self.prevGray, diff);
        cv.threshold(diff, diff, 25, 255, cv.THRESH_BINARY);
        cv.medianBlur(diff, diff, 5);
        postMessage({
          type: "mask",
          maskData: diff.data.slice(0),
          width: diff.cols,
          height: diff.rows
        });
        diff.delete();
      }
      if (self.prevGray) self.prevGray.delete();
      self.prevGray = gray.clone();
      gray.delete();
      src.delete();
      return;
    }

    if (mode === "all") {
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const edges = new cv.Mat();
      cv.Canny(gray, edges, 80, 160);
      postMessage({
        type: "mask",
        maskData: edges.data.slice(0),
        width: edges.cols,
        height: edges.rows
      });
      gray.delete(); edges.delete(); src.delete();
      return;
    }

    if (mode === "human" || mode === "remove" || mode === "blur") {
      await initSegmentation();
      const imgBitmap = await createImageBitmap(frame);
      mpSeg.send({ image: imgBitmap });
      src.delete();
      return; // MediaPipe will send mask asynchronously
    }

    src.delete();
  } catch (err) {
    postMessage({ type: "log", msg: "Worker error: " + err });
  }
};