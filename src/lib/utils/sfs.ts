import * as fflate from 'fflate';
import type { CanvasObject, GlobalTheme } from '../types';

export async function saveSfsArchive(objects: CanvasObject[], theme?: GlobalTheme): Promise<Uint8Array> {
  const archiveData: Record<string, Uint8Array> = {};
  const clonedObjects = JSON.parse(JSON.stringify(objects)) as CanvasObject[];
  const assetPromises: Promise<void>[] = [];

  let imageCounter = 0;

  for (const obj of clonedObjects) {
    if (obj.type === 'image' && obj.src) {
      const currentSrc = obj.src;
      let ext = 'png'; 
      if (currentSrc.includes('image/jpeg')) ext = 'jpg';
      if (currentSrc.includes('image/svg+xml')) ext = 'svg';

      const name = `image_${Math.random().toString(36).substring(2, 8)}_${imageCounter++}.${ext}`;
      const internalPath = `images/${name}`;
      
      assetPromises.push(
        fetch(currentSrc)
          .then(res => res.arrayBuffer())
          .then(buffer => {
            archiveData[internalPath] = new Uint8Array(buffer);
            obj.src = internalPath;
            // Clear original external path reference since it is now bundled
            obj.originalPath = undefined;
          })
          .catch(err => {
             console.warn("Failed to fetch image data for bundled save", err);
          })
      );
    }
  }

  await Promise.all(assetPromises);

  const documentJson = {
    version: "1.0",
    objects: clonedObjects,
    theme: theme ?? null
  };

  archiveData['document.json'] = new TextEncoder().encode(JSON.stringify(documentJson, null, 2));

  return new Promise((resolve, reject) => {
    fflate.zip(archiveData, { level: 6 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function loadSfsArchive(buffer: ArrayBuffer): Promise<{ objects: CanvasObject[]; theme: GlobalTheme | null }> {
  const uint8 = new Uint8Array(buffer);
  
  return new Promise((resolve, reject) => {
    fflate.unzip(uint8, (err, unzipped) => {
      if (err) return reject(err);

      if (!unzipped['document.json']) {
        return reject(new Error("Invalid SFS file: missing document.json"));
      }

      const documentStr = new TextDecoder().decode(unzipped['document.json']);
      const document = JSON.parse(documentStr);
      // Fallback for older formats where json might be a raw array
      const objects: CanvasObject[] = document.objects || (Array.isArray(document) ? document : []);
      const theme: GlobalTheme | null = document.theme ?? null;

      for (const obj of objects) {
        if (obj.type === 'image' && obj.src && obj.src.startsWith('images/')) {
          const imgData = unzipped[obj.src];
          if (imgData) {
            const ext = obj.src.split('.').pop()?.toLowerCase();
            let mime = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
            else if (ext === 'svg') mime = 'image/svg+xml';
            else if (ext === 'webp') mime = 'image/webp';
            
            const blob = new Blob([imgData], { type: mime });
            obj.src = URL.createObjectURL(blob);
          }
        }
      }

      resolve({ objects, theme });
    });
  });
}
