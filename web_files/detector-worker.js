let cvReady = false;
let prevGray = null;

self.importScripts("https://docs.opencv.org/4.x/opencv.js");

self.Module = {
  onRuntimeInitialized() {
    cvReady = true;
    console.log("OpenCV.js worker ready");
  }
};

self.onmessage = e => {
  if (!cvReady) return;
  const { frame, mode } = e.data;
  processFrame(frame, mode);
};

function processFrame(frame, mode) {
  const src = cv.matFromImageData(frame);
  const gray = new cv.Mat();
  const mask = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  if (mode === "motion") {
    if (prevGray) {
      const diff = new cv.Mat();
      cv.absdiff(gray, prevGray, diff);
      cv.threshold(diff, mask, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(mask, mask, 5);
      diff.delete();
    }
  } else if (mode === "color") {
    const hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 50, 50, 0]);
    const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [85, 255, 255, 255]);
    cv.inRange(hsv, low, high, mask);
    hsv.delete(); low.delete(); high.delete();
  } else if (mode === "edges") {
    cv.Canny(gray, mask, 100, 200);
  } else if (mode === "custom") {
    // user’s hand mask drawn in UI — skip auto-processing
    mask.setTo(new cv.Scalar(0));
  }

  if (prevGray) prevGray.delete();
  prevGray = gray.clone();

  self.postMessage({
    type: 'mask',
    mask: mask.data,
    w: mask.cols,
    h: mask.rows
  }, [mask.data.buffer]);

  src.delete(); gray.delete(); mask.delete();
}
