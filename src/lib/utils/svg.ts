import { initWasm, Resvg } from '@resvg/resvg-wasm';

let wasmInitialized = false;

export async function initResvg() {
  if (wasmInitialized) return;
  try {
    // The WASM file should be copied to the static/ directory
    await initWasm(fetch('/resvg.wasm'));
    wasmInitialized = true;
  } catch (err) {
    console.error('Failed to initialize resvg-wasm:', err);
  }
}

/**
 * Renders an SVG string to a high-resolution base64 PNG Data URL.
 * Preserves vector quality by rendering at a high scale multiplier.
 */
export async function renderSvgToDataUrl(svgString: string, scale = 4): Promise<string> {
  await initResvg();
  
  const resvg = new Resvg(svgString, {
    fitTo: {
      mode: 'zoom',
      value: scale, // Render 4x larger for supreme crispness on zoom
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  // Convert Uint8Array to base64
  let binary = '';
  const bytes = new Uint8Array(pngBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}
