import { removeBackground } from '@imgly/background-removal';

// Background removal modes
export const REMOVAL_MODES = {
  IMGLY: 'imgly', // AI-powered (best quality)
  PIXEL_THRESHOLD: 'pixel_threshold' // Simple white background removal
};

// Remove background using imgly AI model
export async function removeBackgroundImgly(base64, mimeType = 'image/png') {
  try {
    console.log('🎨 [BackgroundRemoval] Starting imgly background removal...');

    // Convert base64 to blob
    const byteCharacters = atob(base64.split(',')[1] || base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    console.log('📊 Input blob size:', blob.size, 'bytes');

    // Remove background using imgly
    const resultBlob = await removeBackground(blob);

    console.log('✅ Background removal successful!');
    console.log('📊 Output blob size:', resultBlob.size, 'bytes');

    // Convert result blob to base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('✅ [BackgroundRemoval] Conversion to data URL complete');
        resolve(reader.result);
      };
      reader.onerror = () => {
        console.error('❌ [BackgroundRemoval] Failed to read result blob');
        reject(new Error('Failed to read result blob'));
      };
      reader.readAsDataURL(resultBlob);
    });
  } catch (error) {
    console.error('❌ [BackgroundRemoval] imgly error:', error);
    throw error;
  }
}

// Simple pixel-based white background removal (fallback)
export function removeBackgroundPixelThreshold(base64, mimeType = 'image/png') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const width = canvas.width;
      const height = canvas.height;
      const totalPixels = width * height;
      const visited = new Uint8Array(totalPixels);
      const queue = [];
      let queueHead = 0;

      const colorDistance = (a, b) => {
        const dr = a.r - b.r;
        const dg = a.g - b.g;
        const db = a.b - b.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const getPixelRgb = (pixelIndex) => {
        const offset = pixelIndex * 4;
        return {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
          a: data[offset + 3],
        };
      };

      const edgeColorBuckets = new Map();
      const edgeSamples = [];

      const sampleEdgePixel = (x, y) => {
        const idx = y * width + x;
        const px = getPixelRgb(idx);
        if (px.a === 0) return;

        edgeSamples.push(px);

        const qR = Math.floor(px.r / 32);
        const qG = Math.floor(px.g / 32);
        const qB = Math.floor(px.b / 32);
        const key = `${qR}-${qG}-${qB}`;
        const bucket = edgeColorBuckets.get(key) || {
          count: 0,
          sumR: 0,
          sumG: 0,
          sumB: 0,
        };
        bucket.count += 1;
        bucket.sumR += px.r;
        bucket.sumG += px.g;
        bucket.sumB += px.b;
        edgeColorBuckets.set(key, bucket);
      };

      for (let x = 0; x < width; x++) {
        sampleEdgePixel(x, 0);
        sampleEdgePixel(x, height - 1);
      }
      for (let y = 1; y < height - 1; y++) {
        sampleEdgePixel(0, y);
        sampleEdgePixel(width - 1, y);
      }

      const dominantBgColors = [...edgeColorBuckets.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((bucket) => ({
          r: bucket.sumR / bucket.count,
          g: bucket.sumG / bucket.count,
          b: bucket.sumB / bucket.count,
        }));

      const bgColors = dominantBgColors.length
        ? dominantBgColors
        : [
            { r: 255, g: 255, b: 255 },
            { r: 0, g: 0, b: 0 },
          ];

      let edgeSpread = 0;
      if (edgeSamples.length) {
        const totalSpread = edgeSamples.reduce((acc, sample) => {
          const nearest = bgColors.reduce((best, bg) => {
            const d = colorDistance(sample, bg);
            return d < best ? d : best;
          }, Number.POSITIVE_INFINITY);
          return acc + nearest;
        }, 0);
        edgeSpread = totalSpread / edgeSamples.length;
      }

      const bgTolerance = Math.max(34, Math.min(85, Math.round(42 + edgeSpread * 0.7)));

      const isBackgroundLike = (pixelIndex) => {
        const offset = pixelIndex * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) return true;

        const sample = {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
        };

        const minDistance = bgColors.reduce((best, bg) => {
          const d = colorDistance(sample, bg);
          return d < best ? d : best;
        }, Number.POSITIVE_INFINITY);

        return minDistance <= bgTolerance;
      };

      const enqueueIfEligible = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = y * width + x;
        if (visited[index]) return;
        if (!isBackgroundLike(index)) return;
        visited[index] = 1;
        queue.push(index);
      };

      console.log('🎨 [BackgroundRemoval] Removing outer background (adaptive edge flood-fill)');

      for (let x = 0; x < width; x++) {
        enqueueIfEligible(x, 0);
        enqueueIfEligible(x, height - 1);
      }
      for (let y = 0; y < height; y++) {
        enqueueIfEligible(0, y);
        enqueueIfEligible(width - 1, y);
      }

      while (queueHead < queue.length) {
        const index = queue[queueHead++];
        const x = index % width;
        const y = Math.floor(index / width);
        const offset = index * 4;
        data[offset + 3] = 0;

        enqueueIfEligible(x + 1, y);
        enqueueIfEligible(x - 1, y);
        enqueueIfEligible(x, y + 1);
        enqueueIfEligible(x, y - 1);
      }

      const componentVisited = new Uint8Array(totalPixels);
      let largestComponent = null;

      for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
        if (componentVisited[pixelIndex]) continue;

        const alpha = data[pixelIndex * 4 + 3];
        if (alpha === 0) {
          componentVisited[pixelIndex] = 1;
          continue;
        }

        const componentQueue = [pixelIndex];
        let componentHead = 0;
        componentVisited[pixelIndex] = 1;
        const componentPixels = [];

        while (componentHead < componentQueue.length) {
          const current = componentQueue[componentHead++];
          componentPixels.push(current);

          const cx = current % width;
          const cy = Math.floor(current / width);
          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1],
          ];

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighborIndex = ny * width + nx;
            if (componentVisited[neighborIndex]) continue;
            componentVisited[neighborIndex] = 1;
            const neighborAlpha = data[neighborIndex * 4 + 3];
            if (neighborAlpha > 0) {
              componentQueue.push(neighborIndex);
            }
          }
        }

        if (!largestComponent || componentPixels.length > largestComponent.length) {
          largestComponent = componentPixels;
        }
      }

      if (largestComponent && largestComponent.length > 0) {
        const keepMask = new Uint8Array(totalPixels);
        largestComponent.forEach((idx) => {
          keepMask[idx] = 1;
        });

        for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex++) {
          const offset = pixelIndex * 4;
          if (data[offset + 3] > 0 && !keepMask[pixelIndex]) {
            data[offset + 3] = 0;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      console.log('✅ [BackgroundRemoval] Outer background removal complete', {
        bgTolerance,
        dominantBgColors: bgColors.length,
      });
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      console.warn('⚠️ [BackgroundRemoval] Image load failed, returning original');
      resolve(`data:${mimeType};base64,${base64}`);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// Smart background removal with fallback
export async function removeBackgroundSmart(base64, mimeType = 'image/png', preferredMode = REMOVAL_MODES.IMGLY) {
  console.log(`🎨 [BackgroundRemoval] Starting smart removal (mode: ${preferredMode})`);

  if (preferredMode === REMOVAL_MODES.IMGLY) {
    try {
      const result = await removeBackgroundImgly(base64, mimeType);
      console.log('✅ [BackgroundRemoval] Using imgly mode');
      return result;
    } catch (error) {
      console.warn('⚠️ [BackgroundRemoval] imgly failed, falling back to pixel threshold:', error.message);
      return removeBackgroundPixelThreshold(base64, mimeType);
    }
  } else {
    return removeBackgroundPixelThreshold(base64, mimeType);
  }
}

// Batch remove backgrounds from multiple base64 images
export async function removeBackgroundBatch(base64Array, mimeType = 'image/png', mode = REMOVAL_MODES.IMGLY) {
  console.log(`🎨 [BackgroundRemoval] Starting batch removal (${base64Array.length} images, mode: ${mode})`);

  const results = [];
  for (let i = 0; i < base64Array.length; i++) {
    try {
      console.log(`Processing image ${i + 1}/${base64Array.length}`);
      const result = await removeBackgroundSmart(base64Array[i], mimeType, mode);
      results.push({ success: true, data: result });
    } catch (error) {
      console.error(`❌ Failed to process image ${i + 1}:`, error.message);
      results.push({ success: false, error: error.message });
    }
  }

  console.log(`✅ Batch removal complete: ${results.filter(r => r.success).length}/${base64Array.length} successful`);
  return results;
}

