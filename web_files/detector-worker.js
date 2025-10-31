// detector-worker.js — background frame processor
self.importScripts("https://docs.opencv.org/4.x/opencv.js");

let ready = false;
cv['onRuntimeInitialized'] = () => { ready = true; postMessage({ type: "log", msg: "OpenCV worker ready" }); };

let prevGray = null;

self.onmessage = e => {
  const { type, frame, mode } = e.data;
  if (type !== "process" || !ready) return;

  try {
    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const mask = new cv.Mat();

    if (mode === "motion" && prevGray) {
      cv.absdiff(gray, prevGray, mask);
      cv.threshold(mask, mask, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(mask, mask, 5);
    } else if (mode === "all") {
      cv.Canny(gray, mask, 80, 160);
    } else {
      cv.threshold(gray, mask, 128, 255, cv.THRESH_BINARY);
    }

    if (prevGray) prevGray.delete();
    prevGray = gray.clone();

    src.delete(); gray.delete();

    postMessage({
      type: "mask",
      maskData: mask.data.slice(0),
      width: mask.cols,
      height: mask.rows
    });

    mask.delete();
  } catch (err) {
    postMessage({ type: "log", msg: "Worker error: " + err });
    postMessage({ type: "none" });
  }
};