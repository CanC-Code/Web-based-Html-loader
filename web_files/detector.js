// detector.js
const VideoDetector = (() => {
  let worker = null;
  let canvas = document.getElementById('outputCanvas');
  let ctx = canvas.getContext('2d');
  let processing = false;
  let mode = 'remove';
  let recordedBlobs = [];
  let recorder = null;

  async function startProcessing(selectedMode='remove'){
    if(!worker){
      worker = new Worker('detector-worker.js');
      worker.onmessage = (e)=>{
        const { type, blob } = e.data;
        if(type === 'ready') console.log('AI worker ready');
        if(type === 'mask' && processing){
          createImageBitmap(blob).then(img=>{
            ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img,0,0,canvas.width,canvas.height);
          });
        }
      };
      worker.postMessage({ type:'init', mode: selectedMode });
    }

    mode = selectedMode;
    processing = true;

    // Start recording processed canvas
    recordedBlobs = [];
    try{
      const stream = canvas.captureStream(25);
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.ondataavailable = e => { if(e.data && e.data.size) recordedBlobs.push(e.data); };
      recorder.start(1000);
    } catch(e){ console.warn('Recording unavailable', e); recorder = null; }

    inputVideo.currentTime = 0;
    await inputVideo.play().catch(()=>{});
    processLoop();
  }

  function stopProcessing(){
    processing = false;
    if(recorder && recorder.state === 'recording') recorder.stop();
  }

  function playProcessed(){
    if(recordedBlobs.length === 0) return;
    const blob = new Blob(recordedBlobs, {type:'video/webm'});
    const url = URL.createObjectURL(blob);
    inputVideo.src = url;
    inputVideo.play();
  }

  function downloadProcessed(){
    if(recordedBlobs.length === 0) return;
    const blob = new Blob(recordedBlobs, {type:'video/webm'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `processed_${Date.now()}.webm`;
    a.click();
  }

  async function processLoop(){
    if(!processing) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.drawImage(inputVideo,0,0,width,height);
    const frame = ctx.getImageData(0,0,width,height);
    worker.postMessage({ type:'process', frame, mode }, [frame.data.buffer]);
    requestAnimationFrame(processLoop);
  }

  return { startProcessing, stopProcessing, playProcessed, downloadProcessed };
})();