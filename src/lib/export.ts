/** Serialize an in-DOM SVG element to a standalone SVG string. */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  const str = serializeSvg(svg);
  const blob = new Blob([str], { type: 'image/svg+xml' });
  triggerDownload(URL.createObjectURL(blob), filename);
}

/**
 * Rasterize the SVG to a PNG with a true alpha channel. Drawing an SVG
 * (via an Image) onto a canvas that was never filled with an opaque
 * background preserves transparency, so "Route Only" exports come out
 * as a transparent PNG rather than a flattened screenshot.
 */
export async function downloadPng(
  svg: SVGSVGElement,
  filename: string,
  width: number,
  height: number
) {
  const str = serializeSvg(svg);
  const svgBlob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to rasterize overlay SVG'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  const scale = 2; // export at 2x for crisp Instagram-ready output
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Do NOT fill a background — leave alpha untouched.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG export failed');
  triggerDownload(URL.createObjectURL(blob), filename);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
