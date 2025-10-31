let cvReady = false;
let prevGray = null;

self.importScripts("https://docs.opencv.org/4.x/opencv.js");

self.Module = {
  onRuntimeInitialized() {
    cvReady = true;
    console.log("OpenCV.js worker ready");
  }
};

self.onmessage = async e => {
  if (!cvReady) return;
  const { type, frame } = e.data;
  if (type === 'frame') processFrame(frame);
};

function processFrame(frame) {
  const src = cv.matFromImageData(frame);
  const gray = new cv.Mat();
  const diff = new cv.Mat();
  const mask = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  if (prevGray) {
    cv.absdiff(gray, prevGray, diff);
    cv.threshold(diff, mask, 25, 255, cv.THRESH_BINARY);
    cv.medianBlur(mask, mask, 5);

    // optional: morphological open to remove noise
    let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    kernel.delete();

    // send mask back
    self.postMessage({
      type: 'mask',
      mask: mask.data,
      w: mask.cols,
      h: mask.rows
    }, [mask.data.buffer]);
  }

  if (prevGray) prevGray.delete();
  prevGray = gray.clone();

  src.delete(); diff.delete(); gray.delete(); mask.delete();
}
