const FRAME_HISTORY = 3;
let history = [];

self.onmessage = e => {
  const msg = e.data;
  if(msg.type==='blend'){
    const { width, height, data } = msg;
    const frameData = new Uint8ClampedArray(data);

    history.push(frameData.slice());
    if(history.length > FRAME_HISTORY) history.shift();

    const blended = new Uint8ClampedArray(frameData.length);

    const allFrames = [...history, frameData];
    const count = allFrames.length;

    for(let i=0;i<frameData.length;i+=4){
      let r=0,g=0,b=0,a=0;
      allFrames.forEach(f=>{
        r+=f[i]; g+=f[i+1]; b+=f[i+2]; a+=f[i+3];
      });
      blended[i]=r/count; blended[i+1]=g/count; blended[i+2]=b/count; blended[i+3]=a/count;
    }

    postMessage({type:'frame', data:blended.buffer}, [blended.buffer]);
  }
};