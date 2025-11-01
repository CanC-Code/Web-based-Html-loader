importScripts('https://docs.opencv.org/4.7.0/opencv.js');

onmessage = e => {
  const { frame, mask, effect } = e.data;
  const out = new ImageData(frame.width, frame.height);

  // If OpenCV is loaded and effect is bgBlur, apply Gaussian blur
  if (effect === 'bgBlur' && typeof cv !== 'undefined') {
    let src = cv.matFromImageData(frame);
    let blurred = new cv.Mat();
    cv.GaussianBlur(src, blurred, new cv.Size(21,21), 0);

    for (let i = 0; i < mask.length; i++) {
      const idx = i*4;
      if (mask[i] < 128) {  // Background
        out.data[idx] = blurred.data[idx];
        out.data[idx+1] = blurred.data[idx+1];
        out.data[idx+2] = blurred.data[idx+2];
        out.data[idx+3] = 255;
      } else {  // Foreground
        out.data[idx] = frame.data[idx];
        out.data[idx+1] = frame.data[idx+1];
        out.data[idx+2] = frame.data[idx+2];
        out.data[idx+3] = 255;
      }
    }
    src.delete();
    blurred.delete();

  } else {
    // Loop through each pixel
    for (let i = 0; i < mask.length; i++) {
      const idx = i*4;
      const alpha = mask[i];

      switch(effect) {
        case 'bgRemove':
          // Foreground stays, background transparent
          out.data[idx] = frame.data[idx];
          out.data[idx+1] = frame.data[idx+1];
          out.data[idx+2] = frame.data[idx+2];
          out.data[idx+3] = alpha; // Use mask as alpha
          break;

        case 'objectExclude':
          // Masked area becomes transparent (exclude object)
          if (alpha > 128){ 
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
          // No effect, copy original
          out.data[idx] = frame.data[idx];
          out.data[idx+1] = frame.data[idx+1];
          out.data[idx+2] = frame.data[idx+2];
          out.data[idx+3] = 255;
          break;
      }
    }
  }

  postMessage(out, [out.data.buffer]);
};