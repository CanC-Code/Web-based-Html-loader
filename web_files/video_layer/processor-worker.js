importScripts('https://docs.opencv.org/4.7.0/opencv.js');

onmessage = e => {
  const { frame, mask, effect } = e.data;
  const out = new ImageData(frame.width, frame.height);

  if (effect === 'bgBlur' && typeof cv !== 'undefined') {
    // OpenCV blur implementation for background
    let src = cv.matFromImageData(frame);
    let maskMat = cv.matFromArray(frame.height, frame.width, cv.CV_8UC1, mask);
    let blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(21,21), 0);

    for (let i = 0; i < mask.length; i++) {
      const idx = i*4;
      if (mask[i] < 128) { // background
        out.data[idx] = blurred.data[idx];
        out.data[idx+1] = blurred.data[idx+1];
        out.data[idx+2] = blurred.data[idx+2];
        out.data[idx+3] = 255;
      } else { // foreground
        out.data[idx] = frame.data[idx];
        out.data[idx+1] = frame.data[idx+1];
        out.data[idx+2] = frame.data[idx+2];
        out.data[idx+3] = 255;
      }
    }

    src.delete(); blurred.delete(); maskMat.delete();
  } else {
    // bgRemove, objectExclude, or none
    for (let i = 0; i < mask.length; i++) {
      const idx = i*4;
      const alpha = mask[i];

      switch(effect) {
        case 'bgRemove':
          // Keep foreground, background transparent
          out.data[idx] = frame.data[idx];
          out.data[idx+1] = frame.data[idx+1];
          out.data[idx+2] = frame.data[idx+2];
          out.data[idx+3] = alpha;
          break;

        case 'objectExclude':
          // Remove object (alpha > 128)
          if(alpha > 128){ 
            out.data[idx] = 0; 
            out.data[idx+1] = 0; 
            out.data[idx+2] = 0; 
            out.data[idx+3] = 0; 
          } else { 
            out.data[idx] = frame.data[idx]; 
            out.data[idx+1] = frame.data[idx+1]; 
            out.data[idx+2] = frame.data[idx+2]; 
            out.data[idx+3] = 255; 
          }
          break;

        default:
          // No effect: pass frame as-is
          out.data[idx] = frame.data[idx];
          out.data[idx+1] = frame.data[idx+1];
          out.data[idx+2] = frame.data[idx+2];
          out.data[idx+3] = 255;
          break;
      }
    }
  }

  // Send processed frame back to main thread
  postMessage(out, [out.data.buffer]);
};
