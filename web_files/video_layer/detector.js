// Handles segmentation and optional advanced merging
// For now, we mainly rely on SelfieSegmentation
export async function setupSegmentation(model=1){
  const seg = new SelfieSegmentation({ locateFile: f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
  seg.setOptions({ modelSelection:model });
  await seg.initialize();
  return seg;
}