/**
 * iPhones save photos as HEIC/HEIF by default, but no browser except
 * Safari can decode that format in an <img>/<canvas> — Chrome, Firefox,
 * and Edge just show a broken image with no error. Detect it and convert
 * to a JPEG data URL client-side (via heic2any, a WASM HEIF decoder)
 * before we ever try to render or export it.
 */
export function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}

export async function convertHeicToJpegDataUrl(file: File): Promise<string> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(result) ? result[0] : result;
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read converted image'));
    reader.readAsDataURL(blob);
  });
}
