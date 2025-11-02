const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const input = document.getElementById('videoInput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const featherSlider = document.getElementById('featherSlider');
const status = document.getElementById('status');

let seg=null, bodyPixModel=null, worker=null, running=false, frames=[];

// --- Initialize Models ---
async function initModels(){
  status.textContent='Loading SelfieSegmentation...';
  seg=new SelfieSegmentation({ locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  seg.setOptions({ modelSelection:1 });
  await seg.initialize();

  status.textContent='Loading BodyPix...';
  bodyPixModel=await bodyPix.load({ multiplier:0.75, quantBytes:2 });

  status.textContent='Models ready!';
}
initModels();

// --- Video load ---
input.addEventListener('change',e=>{
  const f=e.target.files[0];
  if(!f) return;
  video.src=URL.createObjectURL(f);
  video.onloadedmetadata=()=>{
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    startBtn.disabled=false;
    status.textContent='Video loaded. Ready to process.';
  };
});

// --- Start processing ---
startBtn.onclick=()=>{
  if(!seg || !bodyPixModel){ status.textContent='Models still loading...'; return; }
  if(worker) worker.terminate();
  worker=new Worker('processor-worker.js');
  frames=[];
  running=true;
  startBtn.disabled=true; stopBtn.disabled=false; downloadBtn.disabled=true;

  worker.onmessage=e=>{
    const msg=e.data;
    if(msg.type==='frame'){
      const img=new ImageData(new Uint8ClampedArray(msg.data), canvas.width, canvas.height);
      ctx.putImageData(img,0,0);
      frames.push(canvas.toDataURL('image/webp',0.9));
    } else if(msg.type==='done'){
      running=false;
      stopBtn.disabled=true;
      downloadBtn.disabled=false;
      status.textContent='Processing done!';
      createVideoPlayback();
    }
  };

  video.play();
  processLoop();
};

// --- Stop ---
stopBtn.onclick=()=>{ running=false; stopBtn.disabled=true; status.textContent='Stopped.'; };

// --- Download ---
downloadBtn.onclick=()=>{
  if(!frames.length) return;
  const blobs=frames.map(f=>{
    const bstr=atob(f.split(',')[1]);
    const u8=new Uint8Array(bstr.length);
    for(let i=0;i<bstr.length;i++) u8[i]=bstr.charCodeAt(i);
    return u8;
  });
  const blob=new Blob(blobs,{ type:'video/webp' });
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='segmented_video.webp';a.click();
};

// --- Frame processing loop ---
async function processLoop(){
  if(!running) return;
  if(video.paused || video.ended){ running=false; stopBtn.disabled=true; createVideoPlayback(); return; }

  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const frame=ctx.getImageData(0,0,canvas.width,canvas.height);

  // --- Multi-model segmentation ---
  const mpPromise=seg.send({ image: video });
  const bpPromise=bodyPixModel.segmentPerson(video, { internalResolution:'medium', segmentationThreshold:0.7 });
  const [mpResult, bpResult]=await Promise.all([mpPromise,bpPromise]);

  const finalMask=combineMasks(mpResult.segmentationMask,bpResult,canvas.width,canvas.height);

  worker.postMessage({
    type:'blend',
    width:frame.width,
    height:frame.height,
    data:frame.data.buffer,
    mask:finalMask.buffer,
    feather:featherSlider.value
  },[frame.data.buffer, finalMask.buffer]);

  video.requestVideoFrameCallback(processLoop);
}

// --- Mask fusion ---
function combineMasks(mpMask,bpMask,width,height){
  const final=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){
    const mpAlpha=mpMask.data[i*4+3]/255;
    const bpAlpha=bpMask.data[i];
    const alpha=Math.max(mpAlpha,bpAlpha);
    final[i*4+0]=0;
    final[i*4+1]=0;
    final[i*4+2]=0;
    final[i*4+3]=alpha*255;
  }
  return final;
}

// --- Playback ---
function createVideoPlayback(){
  const v=document.createElement('video');
  v.controls=true;
  v.src=frames[0];
  const container=document.getElementById('videoContainer');
  container.appendChild(v);
}