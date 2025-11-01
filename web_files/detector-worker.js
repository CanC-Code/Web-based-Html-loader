// detector-worker.js — AI background removal & processing worker
self.importScripts("https://docs.opencv.org/4.x/opencv.js");

let ready = false;
cv['onRuntimeInitialized'] = () => {
  ready = true;
  postMessage({ type: "log", msg: "OpenCV worker ready" });
};

// Keep previous frame for motion detection
let prevGray = null;

// Simple exclusion mask logic (example: top ceiling fan area)
const exclusionRegions = [
  {x:0, y:0, w:1000, h:80} // top region to ignore
];

function applyExclusions(mask) {
  exclusionRegions.forEach(r => {
    const mat = new cv.Mat(mask.rows, mask.cols, cv.CV_8UC1);
    cv.rectangle(mat, new cv.Point(r.x,r.y), new cv.Point(r.x+r.w,r.y+r.h), new cv.Scalar(0), -1);
    cv.bitwise_and(mask, mat, mask);
    mat.delete();
  });
  return mask;
}

self.onmessage = async e => {
  const { type, frame, mode } = e.data;
  if(type !== "process" || !ready) return;

  try {
    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let mask = new cv.Mat();

    if(mode === "backgroundRemove") {
      // simple motion detection for now
      if(prevGray) {
        cv.absdiff(gray, prevGray, mask);
        cv.threshold(mask, mask, 25, 255, cv.THRESH_BINARY);
        cv.medianBlur(mask, mask, 5);
      } else {
        cv.threshold(gray, mask, 128, 255, cv.THRESH_BINARY);
      }
    } else if(mode === "backgroundBlur") {
      // create mask of foreground by motion
      if(prevGray) {
        cv.absdiff(gray, prevGray, mask);
        cv.threshold(mask, mask, 20, 255, cv.THRESH_BINARY);
        cv.medianBlur(mask, mask, 5);
      } else {
        cv.threshold(gray, mask, 128, 255, cv.THRESH_BINARY);
      }
      // apply slight Gaussian blur to entire frame for background effect
      let blurred = new cv.Mat();
      cv.GaussianBlur(src, blurred, new cv.Size(15,15), 0);
      cv.bitwise_and(blurred, blurred, src, cv.bitwise_not(mask));
      blurred.delete();
    } else {
      // default fallback
      cv.threshold(gray, mask, 128, 255, cv.THRESH_BINARY);
    }

    if(prevGray) prevGray.delete();
    prevGray = gray.clone();

    mask = applyExclusions(mask);

    // Return mask as ImageData
    const outData = new ImageData(new Uint8ClampedArray(mask.data), mask.cols, mask.rows);
    postMessage({ type:"mask", mask:outData, width:mask.cols, height:mask.rows });

    src.delete();
    gray.delete();
    mask.delete();
  } catch(err){
    postMessage({ type:"log", msg: "Worker error: " + err });
    postMessage({ type:"none" });
  }
};