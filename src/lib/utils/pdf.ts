import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Inform pdfjs where to find its worker (copied to static/ for Vite access)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Extracts the specified page of a PDF file as a high-resolution Data URL (PNG).
 * @param buffer The ArrayBuffer representing the PDF file
 * @param pageNumber The 1-indexed page number to extract
 * @param scale The DPI scale (e.g., 3 for Retina/high-res rendering)
 */
export async function renderPdfPageToDataUrl(
  buffer: ArrayBuffer,
  pageNumber: number = 1,
  scale: number = 3
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdfDocument = await loadingTask.promise;
  
  if (pageNumber > pdfDocument.numPages || pageNumber < 1) {
    throw new Error(`Requested page ${pageNumber} is out of bounds (1-${pdfDocument.numPages})`);
  }

  const page = await pdfDocument.getPage(pageNumber);

  // Calculate viewport
  const viewport = page.getViewport({ scale });

  // Render to offscreen canvas
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Failed to acquire 2D context for PDF rendering.');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await page.render(renderContext).promise;

  // Convert the canvas to a Data URL (PNG format)
  return canvas.toDataURL('image/png');
}
