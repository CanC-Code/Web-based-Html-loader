const FRAME_HISTORY=3;
let history=[];

self.onmessage=e=>{
  const msg=e.data;
  if(msg.type==='blend'){
    const {width,height,feather}=msg;
    let frame=new Uint8ClampedArray(msg.data);
    const mask=new Uint8ClampedArray(msg.mask);

    // Apply mask to frame
    for(let i=0;i<frame.length;i+=4){
      const alpha=mask[i+3]/255;
      frame[i+0]*=alpha;
      frame[i+1]*=alpha;
      frame[i+2]*=alpha;
      frame[i+3]=255;
    }

    // Temporal AA + multi-frame blending
    history.push(frame);
    if(history.length>FRAME_HISTORY) history.shift();

    const blended=new Uint8ClampedArray(frame.length);
    for(let i=0;i<frame.length;i+=4){
      let r=0,g=0,b=0,a=0;
      history.forEach(f=>{
        r+=f[i]; g+=f[i+1]; b+=f[i+2]; a+=f[i+3];
      });
      const count=history.length;
      blended[i]=r/count;
      blended[i+1]=g/count;
      blended[i+2]=b/count;
      blended[i+3]=a/count;
    }

    self.postMessage({type:'frame',data:blended.buffer},[blended.buffer]);
  }
};