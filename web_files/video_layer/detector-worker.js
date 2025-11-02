// Can be extended to handle motion detection / multi-model fusion
self.onmessage = e => {
  const msg = e.data;
  if(msg.type==='process'){
    // currently placeholder, processing handled in processor-worker.js
    postMessage({type:'done'});
  }
};