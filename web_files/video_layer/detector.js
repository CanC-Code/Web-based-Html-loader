// Example: placeholder for additional ML detection if needed
// Can be extended to integrate more advanced models in the future
export async function detectFrame(videoFrame) {
  // Currently, just passes frame through (Segmentation handled in main)
  return videoFrame;
}

// Optional: you can add feathering, mask cleanup, or secondary detection here
export function refineMask(maskCanvas) {
  const ctx = maskCanvas.getContext('2d');
  // Light blur for feathering
  ctx.filter = 'blur(1px)';
  ctx.drawImage(maskCanvas,0,0);
  ctx.filter = 'none';
  return maskCanvas;
}