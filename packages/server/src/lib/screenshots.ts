type ScreenshotFormat = 'png' | 'jpeg';

export function getScreenshotMimeType(format: ScreenshotFormat): 'image/png' | 'image/jpeg' {
  return format === 'png' ? 'image/png' : 'image/jpeg';
}

export function getScreenshotFileExtension(format: ScreenshotFormat): 'png' | 'jpg' {
  return format === 'png' ? 'png' : 'jpg';
}

export function toScreenshotDataUrl(bytes: Uint8Array, format: ScreenshotFormat): string {
  return `data:${getScreenshotMimeType(format)};base64,${Buffer.from(bytes).toString('base64')}`;
}
