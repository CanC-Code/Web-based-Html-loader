// detector-worker.js (enhanced)
let width = 0;
let height = 0;
const HISTORY_LENGTH = 3;
const FEATHER_RADIUS = 4;

let maskHistory = [];

// simple separable box blur on alpha channel
function boxBlurAlpha(alpha, w, h, radius) {
  const tmp = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);

  // horizontal pass
  const window = 2*radius+1;
  for (let y=0;y<h;y++) {
    let sum = 0;
    for (let x=0;x<w;x++) {
      const idx = y*w + x;
      sum += alpha[idx];
      if (x>=window) {
        sum -= alpha[y*w + x - window];
      }
      tmp[idx] = Math.round(sum / Math.min(window, x+1));
    }
  }
  // vertical pass
  for (let x=0;x<w;x++) {
    let sum = 0;
    for (let y=0;y<h;y++) {
      const idx = y*w + x;
      sum += tmp[idx];
      if (y>=window) {
        sum -= tmp[(y-window)*w + x];
      }
      out[idx] = Math.round(sum / Math.min(window, y+1));
    }
  }
  return out;
}

self.onmessage = e => {
  const msg = e.data;
  if (msg.type === 'init') {
    width = msg.width;
    height = msg.height;
    maskHistory = [];
    return;
  }

  if (msg.type === 'mask') {
    const { frameId, width: w, height: h, data } = msg;
    // data is Uint8ClampedArray buffer of RGBA
    const rgba = new Uint8ClampedArray(data);
    // extract alpha channel into simple 1-byte-per-pixel array
    const alpha = new Uint8ClampedArray(w*h);
    for (let i=0, j=0;i<rgba.length;i+=4, j++) alpha[j] = rgba[i+3];

    // push to history
    maskHistory.push(alpha);
    if (maskHistory.length > HISTORY_LENGTH) maskHistory.shift();

    // temporal average
    const avg = new Uint16Array(w*h);
    for (let k=0;k<maskHistory.length;k++) {
      const m = maskHistory[k];
      for (let i=0;i<m.length;i++) avg[i] += m[i];
    }
    const denom = maskHistory.length;
    const alphaAvg = new Uint8ClampedArray(w*h);
    for (let i=0;i<avg.length;i++) alphaAvg[i] = Math.round(avg[i]/denom);

    // feather / blur alpha
    const alphaFeather = boxBlurAlpha(alphaAvg, w, h, FEATHER_RADIUS);

    // compose output rgba with preserved alpha
    const out = new Uint8ClampedArray(w*h*4);
    for (let i=0, j=0;i<out.length;i+=4, j++) {
      // white mask (RGB=255) with smoothed alpha
      out[i] = 255;
      out[i+1] = 255;
      out[i+2] = 255;
      out[i+3] = alphaFeather[j];
    }

    // post back with transferable buffer
    self.postMessage({ type:'mask', frameId, width:w, height:h, buffer: out.buffer }, [out.buffer]);
  }
};
