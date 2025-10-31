// detector.js
let Detector = {
  ready: false,
  prevGray: null,

  async init() {
    if (typeof cv === "undefined") {
      await new Promise(resolve => {
        let script = document.createElement("script");
        script.src = "https://docs.opencv.org/4.x/opencv.js";
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }

    await new Promise(r => cv['onRuntimeInitialized'] = r);
    this.ready = true;
    console.log("OpenCV.js initialized");
  },

  async processFrame(frame) {
    if (!this.ready) return null;

    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    const diff = new cv.Mat();
    const mask = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    if (this.prevGray) {
      cv.absdiff(gray, this.prevGray, diff);
      cv.threshold(diff, mask, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(mask, mask, 5);
    }

    if (this.prevGray) this.prevGray.delete();
    this.prevGray = gray.clone();

    src.delete(); diff.delete(); gray.delete();
    return mask;
  },

  applyMask(ctx, maskMat) {
    const imgData = new ImageData(new Uint8ClampedArray(maskMat.data), maskMat.cols, maskMat.rows);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = maskMat.cols;
    tempCanvas.height = maskMat.rows;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }
};
