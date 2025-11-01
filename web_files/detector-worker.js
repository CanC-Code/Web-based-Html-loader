// detector-worker.js — background AI mask processor
self.importScripts("https://docs.opencv.org/4.x/opencv.js");

let ready = false;
cv['onRuntimeInitialized'] = () => { ready = true; postMessage({ type:"log", msg:"OpenCV Worker Ready" }); };

let prevGray = null;
let feedbackMasks = [];

self.onmessage = e => {
  const { type, frame, mode, feedback, mask } = e.data;

  // Handle feedback from UI
  if(type === "feedback" && mask){
    feedbackMasks.push({ mask, feedback });
    if(feedbackMasks.length > 20) feedbackMasks.shift();
    return;
  }

  if(type !== "process" || !ready) return;

  try {
    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const maskMat = new cv.Mat();

    if(mode === "motion" && prevGray){
      cv.absdiff(gray, prevGray, maskMat);
      cv.threshold(maskMat, maskMat, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(maskMat, maskMat, 5);
    } else if(mode === "all"){
      cv.Canny(gray, maskMat, 80, 160);
    } else {
      cv.threshold(gray, maskMat, 128, 255, cv.THRESH_BINARY);
    }

    if(prevGray) prevGray.delete();
    prevGray = gray.clone();
    src.delete(); gray.delete();

    // Apply feedback exclusions
    if(feedbackMasks.length > 0){
      feedbackMasks.forEach(fb => {
        if(fb.feedback === "dislike"){
          maskMat.data.set(maskMat.data.map((v,i)=> fb.mask.data[i]>0 ? 0 : v));
        }
        if(fb.feedback === "like"){
          maskMat.data.set(maskMat.data.map((v,i)=> fb.mask.data[i]>0 ? 255 : v));
        }
      });
    }

    postMessage({ type:"mask", maskData: maskMat.data.slice(0), width: maskMat.cols, height: maskMat.rows });

    maskMat.delete();
  } catch(err){
    postMessage({ type:"log", msg:"Worker error: " + err });
  }
};