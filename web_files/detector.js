// detector.js — UI + worker bridge
const worker = new Worker("detector-worker.js");
let maskHistory = [];
let pendingProcess = null;

worker.onmessage = e => {
  const { type, maskData, width, height, msg } = e.data;
  if(type === "mask"){
    const mask = new ImageData(new Uint8ClampedArray(maskData), width, height);
    maskHistory.push(mask);
    if(maskHistory.length > 10) maskHistory.shift();
    if(typeof currentCtx !== "undefined") applyMask(currentCtx, mask);
  } else if(type==="log") console.log("[Worker]", msg);
};

// Apply mask overlay
function applyMask(ctx, mask){
  const temp = new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height);
  const tCanvas = document.createElement("canvas");
  tCanvas.width = mask.width;
  tCanvas.height = mask.height;
  tCanvas.getContext("2d").putImageData(temp,0,0);
  ctx.save();
  ctx.globalCompositeOperation="destination-in";
  ctx.drawImage(tCanvas,0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.restore();
}

// Send frame for processing
function processFrame(frame, mode){
  return new Promise(resolve=>{
    pendingProcess = true;
    worker.postMessage({ type:"process", frame, mode });
    setTimeout(()=>{ pendingProcess=false; resolve(); }, 0);
  });
}

// Send feedback
function sendFeedback(mask, feedback){
  worker.postMessage({ type:"feedback", mask, feedback });
}