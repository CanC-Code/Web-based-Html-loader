// detector.js — companion module for Video Layer Stable Editor
// Handles frame processing using OpenCV.js, offloading heavy work to detector-worker.js when available

const Detector = {
  ready: false,
  mode: "motion",
  useWorker: false,
  worker: null,
  prevGray: null,

  async init(options = {}) {
    this.mode = options.mode || "motion";

    // try to load OpenCV.js if not yet loaded
    if (typeof cv === "undefined") {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://docs.opencv.org/4.x/opencv.js";
        script.onload = () => {
          cv['onRuntimeInitialized'] = () => {
            resolve();
          };
        };
        script.onerror = () => reject(new Error("Failed to load OpenCV.js"));
        document.head.appendChild(script);
      });
    } else if (!cv.Mat) {
      await new Promise(r => cv['onRuntimeInitialized'] = r);
    }

    // initialize Web Worker if supported
    try {
      this.worker = new Worker("detector-worker.js");
      this.worker.onmessage = e => {
        if (e.data.type === "log") console.log("[DetectorWorker]", e.data.msg);
      };
      this.useWorker = true;
      console.log("Detector: Web Worker active");
    } catch (err) {
      console.warn("Detector: worker not available, fallback to main thread", err);
      this.useWorker = false;
    }

    this.ready = true;
    console.log("Detector initialized with mode:", this.mode);
  },

  /**
   * Process a frame from canvas context (ImageData).
   * Returns a binary mask (cv.Mat) or null if no changes detected.
   */
  async processFrame(frame, opts = {}) {
    if (!this.ready) return null;
    const mode = opts.mode || this.mode;

    // handle via worker if available
    if (this.useWorker) {
      return new Promise(resolve => {
        const offscreen = frame.data.buffer.slice(0);
        this.worker.onmessage = e => {
          if (e.data.type === "mask") {
            const { maskData, width, height } = e.data;
            const maskMat = new cv.Mat(height, width, cv.CV_8UC1);
            maskMat.data.set(new Uint8Array(maskData));
            resolve(maskMat);
          } else if (e.data.type === "none") {
            resolve(null);
          }
        };
        this.worker.postMessage({ type: "process", frame, mode });
      });
    }

    // fallback to main thread
    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let mask = new cv.Mat();

    if (mode === "motion" && this.prevGray) {
      cv.absdiff(gray, this.prevGray, mask);
      cv.threshold(mask, mask, 25, 255, cv.THRESH_BINARY);
      cv.medianBlur(mask, mask, 5);
    } else if (mode === "all") {
      cv.Canny(gray, mask, 80, 160);
    } else if (mode === "human") {
      // simple person detection via Haar cascades (lightweight)
      try {
        if (!this.cascade) {
          this.cascade = new cv.CascadeClassifier();
          await this.loadCascade("https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_fullbody.xml");
        }
        const bodies = new cv.RectVector();
        this.cascade.detectMultiScale(gray, bodies, 1.1, 3, 0);
        mask.setTo(new cv.Scalar(0, 0, 0, 255));
        for (let i = 0; i < bodies.size(); i++) {
          const r = bodies.get(i);
          cv.rectangle(mask, new cv.Point(r.x, r.y), new cv.Point(r.x + r.width, r.y + r.height), new cv.Scalar(255), -1);
        }
        bodies.delete();
      } catch (err) {
        console.warn("Human detection fallback:", err);
        cv.threshold(gray, mask, 128, 255, cv.THRESH_BINARY);
      }
    }

    if (this.prevGray) this.prevGray.delete();
    this.prevGray = gray.clone();

    src.delete(); gray.delete();

    return mask;
  },

  async loadCascade(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    cv.FS_createDataFile("/", "cascade.xml", data, true, false, false);
    this.cascade.load("cascade.xml");
  },

  /**
   * Apply the mask over the video frame context
   * @param {CanvasRenderingContext2D} ctx 
   * @param {cv.Mat} maskMat 
   */
  applyMask(ctx, maskMat) {
    if (!maskMat) return;
    const maskImage = new ImageData(new Uint8ClampedArray(maskMat.data), maskMat.cols, maskMat.rows);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = maskMat.cols;
    tempCanvas.height = maskMat.rows;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.putImageData(maskImage, 0, 0);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();

    maskMat.delete();
  }
};