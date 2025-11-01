// processor-worker.js
// Receives: { frameId, frame: ImageData, mask: Uint8ClampedArray, effect: string }
// Returns: processed ImageData (RGBA) via postMessage(ImageData, [buffer])

importScripts('https://docs.opencv.org/4.7.0/opencv.js');

function createEmptyOutput(w, h) {
  return new ImageData(w, h);
}

function simpleBoxBlurRGBA(frame, radius=3) {
  // Very simple box blur fallback - operates in-place copy (slow but functional)
  const w = frame.width, h = frame.height;
  const src = frame.data;
  const out = new Uint8ClampedArray(src.length);
  const r = radius;
  const div = (2*r+1)*(2*r+1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum=0,gSum=0,bSum=0,aSum=0;
      for (let ky=-r; ky<=r; ky++){
        for (let kx=-r; kx<=r; kx++){
          const nx = Math.min(w-1, Math.max(0, x+kx));
          const ny = Math.min(h-1, Math.max(0, y+ky));
          const idx = (ny*w + nx)*4;
          rSum += src[idx]; gSum += src[idx+1]; bSum += src[idx+2]; aSum += src[idx+3];
        }
      }
      const idxOut = (y*w + x)*4;
      out[idxOut] = Math.round(rSum/div);
      out[idxOut+1] = Math.round(gSum/div);
      out[idxOut+2] = Math.round(bSum/div);
      out[idxOut+3] = Math.round(aSum/div);
    }
  }
  return new ImageData(out, w, h);
}

onmessage = (ev) => {
  const data = ev.data;
  if (!data) return;
  const { frameId, frame, mask, effect } = data;
  const w = frame.width, h = frame.height;
  const out = createEmptyOutput(w, h);

  // Branch: bgBlur uses OpenCV if available
  if (effect === 'bgBlur' && typeof cv !== 'undefined' && cv && cv.matFromImageData) {
    try {
      // Convert frame to mat
      const src = cv.matFromImageData(frame);
      const blurred = new cv.Mat();
      // kernel size picks adaptively depending on smaller dimension
      const k = Math.max(3, Math.floor(Math.min(w,h)/50) | 1); // odd
      cv.GaussianBlur(src, blurred, new cv.Size(k,k), 0);

      // Compose: where mask is background (mask<128) pick blurred, else pick src
      for (let i = 0, p = 0; i < mask.length; i++, p+=4) {
        if (mask[i] < 128) {
          // Access blurred.data: CV_8UC4 sequential
          out.data[p]   = blurred.data[p];
          out.data[p+1] = blurred.data[p+1];
          out.data[p+2] = blurred.data[p+2];
          out.data[p+3] = 255;
        } else {
          out.data[p]   = frame.data[p];
          out.data[p+1] = frame.data[p+1];
          out.data[p+2] = frame.data[p+2];
          out.data[p+3] = 255;
        }
      }

      src.delete(); blurred.delete();
      postMessage(out, [out.data.buffer]);
      return;
    } catch (err) {
      // fallback to JS blur below
      console.warn('OpenCV blur failed, falling back to JS blur', err);
    }
  }

  // Non-blur or fallback path (bgRemove, objectExclude, none, or bgBlur fallback)
  if (effect === 'bgRemove') {
    // Use mask as alpha channel
    for (let i=0, p=0; i<mask.length; i++, p+=4) {
      out.data[p]   = frame.data[p];
      out.data[p+1] = frame.data[p+1];
      out.data[p+2] = frame.data[p+2];
      out.data[p+3] = mask[i]; // 0..255 alpha
    }
    postMessage(out, [out.data.buffer]);
    return;
  }

  if (effect === 'objectExclude') {
    for (let i=0, p=0; i<mask.length; i++, p+=4) {
      if (mask[i] > 128) {
        out.data[p] = 0; out.data[p+1] = 0; out.data[p+2] = 0; out.data[p+3] = 0;
      } else {
        out.data[p] = frame.data[p];
        out.data[p+1] = frame.data[p+1];
        out.data[p+2] = frame.data[p+2];
        out.data[p+3] = 255;
      }
    }
    postMessage(out, [out.data.buffer]);
    return;
  }

  // bgBlur fallback / or 'none'
  if (effect === 'bgBlur') {
    // fallback: simple box blur of full frame, then composite using mask
    const blurredImage = simpleBoxBlurRGBA(frame, 2);
    for (let i=0, p=0; i<mask.length; i++, p+=4) {
      if (mask[i] < 128) {
        out.data[p]   = blurredImage.data[p];
        out.data[p+1] = blurredImage.data[p+1];
        out.data[p+2] = blurredImage.data[p+2];
        out.data[p+3] = 255;
      } else {
        out.data[p]   = frame.data[p];
        out.data[p+1] = frame.data[p+1];
        out.data[p+2] = frame.data[p+2];
        out.data[p+3] = 255;
      }
    }
    postMessage(out, [out.data.buffer]);
    return;
  }

  // default: no effect -> passthrough
  for (let i=0, p=0; i<mask.length; i++, p+=4) {
    out.data[p]   = frame.data[p];
    out.data[p+1] = frame.data[p+1];
    out.data[p+2] = frame.data[p+2];
    out.data[p+3] = 255;
  }
  postMessage(out, [out.data.buffer]);
};