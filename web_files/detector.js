// detector.js — UI + worker bridge
const worker = new Worker("detector-worker.js");
let maskHistory = [];
let pendingProcess = false;

worker.onmessage = e=>{
  const {type, maskData, width, height, msg} = e.data;
  if(type==="mask"){
    const mask = new ImageData(new Uint8ClampedArray(maskData), width, height);
    maskHistory.push(mask);
    if(maskHistory.length>10) maskHistory.shift();
    if(typeof currentCtx!=="undefined") applyMask(currentCtx, mask);
  }else if(type==="log") console.log("[Worker]", msg);
};

function applyMask(ctx, mask){
  const temp = new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height);
  const tCanvas = document.createElement("canvas");
  tCanvas.width=mask.width;
  tCanvas.height=mask.height;
  tCanvas.getContext("2d").putImageData(temp,0,0);
  ctx.save();
  ctx.globalCompositeOperation="destination-in";
  ctx.drawImage(tCanvas,0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.restore();
}

function processFrame(frame, mode){
  return new Promise(resolve=>{
    pendingProcess=true;
    worker.postMessage({type:"process", frame, mode});
    setTimeout(()=>{ pendingProcess=false; resolve(); },0);
  });
}

function sendFeedback(mask, feedback){
  worker.postMessage({type:"feedback", mask, feedback});
}