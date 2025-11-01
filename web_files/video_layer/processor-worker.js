onmessage = e => {
  const { frame, mask, effect } = e.data;
  const out = new ImageData(frame.width, frame.height);

  for (let i = 0; i < mask.length; i++) {
    const idx = i * 4;
    const alpha = mask[i]; // 0-255

    switch(effect) {
      case 'bgRemove':
        // Keep foreground, make background transparent
        out.data[idx] = frame.data[idx];
        out.data[idx+1] = frame.data[idx+1];
        out.data[idx+2] = frame.data[idx+2];
        out.data[idx+3] = alpha;
        break;

      case 'bgBlur':
        // Placeholder for blur effect; alpha can control blending
        // For production, replace with OpenCV.js Gaussian blur
        out.data[idx] = frame.data[idx];
        out.data[idx+1] = frame.data[idx+1];
        out.data[idx+2] = frame.data[idx+2];
        out.data[idx+3] = 255;
        break;

      case 'objectExclude':
        // Remove foreground object based on mask
        if (alpha > 128) {
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
        // No effect
        out.data[idx] = frame.data[idx];
        out.data[idx+1] = frame.data[idx+1];
        out.data[idx+2] = frame.data[idx+2];
        out.data[idx+3] = 255;
        break;
    }
  }

  postMessage(out, [out.data.buffer]);
};
