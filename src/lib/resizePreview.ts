/** Map export pixels onto a bounded editor preview. The crop is never changed. */
export function resizePreviewGeometry(
  outputWidth: number, outputHeight: number, nativeWidth: number, nativeHeight: number,
  maxWidth = 620, maxHeight = 360,
) {
  const ratio = outputWidth / Math.max(1, outputHeight);
  const referenceWidth = Math.min(maxWidth, maxHeight * ratio);
  const scale = Math.min(1, outputWidth / Math.max(1, nativeWidth),
    outputHeight / Math.max(1, nativeHeight));
  return { width: Math.max(40, Math.round(referenceWidth * scale)),
    ratio, referenceWidth };
}

/** Pointer travel maps to native pixel units, independent of preview zoom. */
export function draggedOutputWidth(
  initialWidth: number, deltaX: number, nativeWidth: number, referenceWidth: number,
) {
  return Math.round(initialWidth + deltaX * nativeWidth / Math.max(1, referenceWidth));
}
