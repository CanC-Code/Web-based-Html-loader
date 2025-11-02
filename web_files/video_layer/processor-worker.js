// processor-worker.js
// Receives messages:
// { type:'process', id, width, height, frameBuffer, maskBuffer, effect }
// Replies:
// { type:'processed', id, data: ArrayBuffer }
// Or on error: { type:'error', id, message }

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg) return;
  if (msg.type === 'process') {
    const { id, width, height, effect } = msg;
    try {
      // Reconstruct ImageData / mask
      const frameArr = new Uint8ClampedArray(msg.frameBuffer);
      const maskArr = new Uint8ClampedArray(msg.maskBuffer);
      const out = new Uint8ClampedArray(frameArr.length); // RGBA output

      // if effect is bgRemove -> set alpha = mask value
      if (effect === 'bgRemove') {
        for (let i=0, p=0, q=0; q<maskArr.length; q++, p+=4) {
          out[p]   = frameArr[p];
          out[p+1] = frameArr[p+1];
          out[p+2] = frameArr[p+2];
          out[p+3] = maskArr[q]; // mask 0..255
        }
      } else if (effect === 'objectExclude') {
        for (let i=0, p=0, q=0; q<maskArr.length; q++, p+=4) {
          if (maskArr[q] > 128) {
            out[p]=0; out[p+1]=0; out[p+2]=0; out[p+3]=0;
          } else {
            out[p]=frameArr[p]; out[p+1]=frameArr[p+1]; out[p+2]=frameArr[p+2]; out[p+3]=255;
          }
        }
      } else if (effect === 'bgBlur') {
        // simple fast blur fallback: box blur with radius 2 on background pixels
        // create a temp copy for reading
        const w = width, h = height;
        // naive approach: compute blurred full image then composite
        // compute simple box blur on full frame (single pass separable would be faster; keep simple)
        const blurred = new Uint8ClampedArray(frameArr.length);
        const radius = 2;
        const div = (2*radius+1)*(2*radius+1);
        for (let y=0; y<h; y++) {
          for (let x=0; x<w; x++) {
            let rSum=0,gSum=0,bSum=0,aSum=0;
            for (let ky=-radius; ky<=radius; ky++) {
              const ny = Math.min(h-1, Math.max(0, y+ky));
              for (let kx=-radius; kx<=radius; kx++) {
                const nx = Math.min(w-1, Math.max(0, x+kx));
                const idx = (ny*w + nx)*4;
                rSum += frameArr[idx]; gSum += frameArr[idx+1]; bSum += frameArr[idx+2]; aSum += frameArr[idx+3];
              }
            }
            const outIdx = (y*w + x)*4;
            blurred[outIdx]   = Math.round(rSum/div);
            blurred[outIdx+1] = Math.round(gSum/div);
            blurred[outIdx+2] = Math.round(bSum/div);
            blurred[outIdx+3] = 255;
          }
        }
        // composite: where mask < 128 (background) use blurred, else original
        for (let q=0, p=0; q<maskArr.length; q++, p+=4) {
          if (maskArr[q] < 128) {
            out[p]=blurred[p]; out[p+1]=blurred[p+1]; out[p+2]=blurred[p+2]; out[p+3]=255;
          } else {
            out[p]=frameArr[p]; out[p+1]=frameArr[p+1]; out[p+2]=frameArr[p+2]; out[p+3]=255;
          }
        }
      } else {
        // default passthrough
        for (let i=0;i<frameArr.length;i++) out[i] = frameArr[i];
      }

      // send processed image buffer back
      self.postMessage({ type:'processed', id, data: out.buffer }, [out.buffer]);
    } catch (err) {
      self.postMessage({ type:'error', id: msg.id, message: String(err) });
    }
  }
};