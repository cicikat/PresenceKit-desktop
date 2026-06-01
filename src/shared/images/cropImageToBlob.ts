export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.src = url;
  });
}

export async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: PixelCrop,
  width: number,
  height: number,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, canvas.width, canvas.height,
  );
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
}
