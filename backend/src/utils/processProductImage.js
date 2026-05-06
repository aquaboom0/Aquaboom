import sharp from 'sharp';

/** Square card-friendly output for storefront grid/detail (JPEG). */
export const PRODUCT_IMAGE_MAX = 800;

/**
 * Normalize admin-uploaded product photo: auto-orient, cover-crop square, JPEG.
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
export async function resizeProductPhotoBuffer(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(PRODUCT_IMAGE_MAX, PRODUCT_IMAGE_MAX, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}
