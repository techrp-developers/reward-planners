// Operate on alpha rather than painting a background color. Restore copies
// all four original channels, including any original transparency.
export function paintCoverBrush(pixels: Uint8ClampedArray, original: Uint8ClampedArray,
  width: number, height: number, x: number, y: number, radius: number, restore: boolean) {
  for (let py = Math.max(0, Math.floor(y - radius)); py < Math.min(height, Math.ceil(y + radius)); py++) {
    for (let px = Math.max(0, Math.floor(x - radius)); px < Math.min(width, Math.ceil(x + radius)); px++) {
      if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 > radius ** 2) continue;
      const offset = (py * width + px) * 4;
      if (restore) for (let channel = 0; channel < 4; channel++) pixels[offset + channel] = original[offset + channel];
      else pixels[offset + 3] = 0;
    }
  }
}
