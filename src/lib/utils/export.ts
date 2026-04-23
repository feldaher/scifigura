import type { CanvasObject } from '../types';
import { drawObject } from './render';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';

export type ExportFormat = 'png' | 'tiff' | 'svg' | 'pdf';
export type ExportDPI = 72 | 300 | 600;

export interface ExportOptions {
  format: ExportFormat;
  dpi: ExportDPI;
  filename?: string;
  transparent?: boolean;
}

/**
 * Main export function.
 * Renders the objects to the requested format and resolution.
 * Returns a Blob that can be saved.
 */
export async function exportCanvas(
  objects: CanvasObject[],
  options: ExportOptions,
  imageCache: Map<string, HTMLImageElement>
): Promise<Blob | null> {
  // 1. Calculate Bounding Box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const expand = (o: CanvasObject) => {
    let ox = o.x, oy = o.y, ow = o.width, oh = o.height;
    
    if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
      ox = Math.min(o.x, o.x2);
      oy = Math.min(o.y, o.y2);
      ow = Math.abs(o.x - o.x2);
      oh = Math.abs(o.y - o.y2);
      // Add padding for arrowheads/stroke?
      const p = (o.strokeWidth || 2) * 2 + 10; 
      ox -= p; oy -= p; ow += p * 2; oh += p * 2;
    } else if (o.type !== "group") {
        // Standard shapes
        // Add padding for stroke
        const p = (o.strokeWidth || 0) / 2;
        ox -= p; oy -= p; ow += p * 2; oh += p * 2;
    }

    minX = Math.min(minX, ox);
    minY = Math.min(minY, oy);
    maxX = Math.max(maxX, ox + ow);
    maxY = Math.max(maxY, oy + oh);

    if (o.type === "group" && o.children) {
      o.children.forEach(expand);
    }
  };

  objects.forEach(expand);

  if (!isFinite(minX)) {
    // Empty canvas
    return null;
  }

  // padding
  const padding = 20;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  
  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) return null;

  if (options.format === 'svg') {
    return exportSVG(objects, { minX, minY, width, height });
  } else if (options.format === 'pdf') {
    return exportPDF(objects, { minX, minY, width, height }, options.dpi);
  } else {
    return exportRaster(objects, { minX, minY, width, height }, options, imageCache);
  }
}

async function exportPDF(
    objects: CanvasObject[], 
    bounds: { minX: number, minY: number, width: number, height: number },
    dpi: number
): Promise<Blob> {
    const { minX, minY, width, height } = bounds;
    
    // Downsample images to the target DPI
    // 1 "canvas unit" (pt) is 1/72 inch. Target pixels = width_in_pt * (dpi / 72)
    const scale = dpi / 72;
    const clonedObjects = await Promise.all(objects.map(async (obj) => {
        if (obj.type === "image" && obj.src) {
            // Load original image
            const img = new Image();
            img.src = obj.src;
            await new Promise((res) => { img.onload = res; img.onerror = res; });
            
            // Calculate target pixel dimensions based on canvas width and specified DPI
            const targetW = Math.ceil(obj.width * scale);
            const targetH = Math.ceil(obj.height * scale);
            
            // Only downsample if the original is actually larger than the target resolution
            if (img.naturalWidth > targetW || img.naturalHeight > targetH) {
                const c = document.createElement("canvas");
                c.width = targetW;
                c.height = targetH;
                const ctx = c.getContext("2d");
                if (ctx) {
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                    return { ...obj, src: c.toDataURL("image/jpeg", 0.9) };
                }
            }
        }
        return obj;
    }));

    const svgBlob = exportSVG(clonedObjects, bounds);
    const svgText = await svgBlob.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = doc.documentElement;

    const pdf = new jsPDF({
        orientation: width > height ? 'l' : 'p',
        unit: 'pt',
        format: [width, height]
    });

    await pdf.svg(svgElement, {
        x: 0,
        y: 0,
        width: width,
        height: height
    });

    return pdf.output("blob");
}

function exportSVG(
    objects: CanvasObject[], 
    bounds: { minX: number, minY: number, width: number, height: number }
): Blob {
    const { minX, minY, width, height } = bounds;
    
    // Embed the raw canvas state so this SVG can be re-imported dynamically as editable shapes
    const stateJson = JSON.stringify(objects);
    const escapedJson = stateJson.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" data-scifigura="${escapedJson}" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">\n`;

    // Recursive SVG generator
    const objToSVG = (o: CanvasObject): string => {
      if (o.type === "group" && o.children) {
        return `<g>${o.children.map(objToSVG).join("\n")}</g>`;
      }

      // transform center for rotation
      let transform = "";
      if (o.rotation) {
         const cx = o.x + o.width / 2;
         const cy = o.y + o.height / 2;
         // Note: SVG Rotate is around point, but attribute is `rotate(deg, cx, cy)`
         // Canvas uses radians. SVG uses degrees.
         const deg = o.rotation * 180 / Math.PI;
         transform = ` transform="rotate(${deg}, ${cx}, ${cy})"`;
      }

      let content = "";
      if (o.type === "rectangle") {
        content = `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="${o.fill}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}"${transform} />`;
      } else if (o.type === "ellipse") {
        // Ellipse in SVG uses cx, cy
        content = `<ellipse cx="${o.x + o.width / 2}" cy="${o.y + o.height / 2}" rx="${o.width / 2}" ry="${o.height / 2}" fill="${o.fill}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}"${transform} />`;
      } else if (o.type === "arc") {
        const ecx = o.x + o.width / 2;
        const ecy = o.y + o.height / 2;
        const rx = Math.abs(o.width / 2);
        const ry = Math.abs(o.height / 2);
        const sa = o.startAngle ?? 0;
        const ea = o.endAngle ?? Math.PI * 2;
        const closure = o.arcClosed ?? "pie";
        // Compute arc start/end points on the ellipse
        const x1 = ecx + rx * Math.cos(sa);
        const y1 = ecy + ry * Math.sin(sa);
        const x2 = ecx + rx * Math.cos(ea);
        const y2 = ecy + ry * Math.sin(ea);
        // Large arc flag: 1 if the arc spans > 180deg
        let sweep = ea - sa;
        while (sweep < 0) sweep += Math.PI * 2;
        const largeArc = sweep > Math.PI ? 1 : 0;
        let d = `M ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2}`;
        if (closure === "pie") d = `M ${ecx} ${ecy} L ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        else if (closure === "chord") d += " Z";
        content = `<path d="${d}" fill="${closure === "open" ? "none" : o.fill}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}"${transform} />`;
      } else if (o.type === "line") {

        const x2 = o.x2 ?? o.x;
        const y2 = o.y2 ?? o.y;
        
        // For line rotation, we usually rotate around midpoint.
        // But our data model stores x,y,x2,y2 which defines the line.
        // If rotation is applied to line, check how it's handled in render.ts.
        // render.ts rotates context around midpoint.
        // So yes, `transform` above should work if cx/cy is midpoint.
        if (o.rotation) {
             const cx = (o.x + x2)/2;
             const cy = (o.y + y2)/2;
             const deg = o.rotation * 180 / Math.PI;
             transform = ` transform="rotate(${deg}, ${cx}, ${cy})"`;
        }

        content = `<line x1="${o.x}" y1="${o.y}" x2="${x2}" y2="${y2}" stroke="${o.stroke || "black"}" stroke-width="${o.strokeWidth || 2}"${transform} />`;
        
        // Arrowheads - tricky in SVG without defs/markers.
        // Manual polygon drawing like in render.ts
        if (o.arrowEnd) {
             const angle = Math.atan2(y2 - o.y, x2 - o.x); // Rotation handled by transform? NO.
             // If the line is rotated via transform, the arrowhead points should form part of the group or be transformed too.
             // Easiest is to add arrowhead polygons to the SVG code here, assuming they are children of a group with the line?
             // Or just append them.
             // If we rely on `transform` on the line element, the arrowhead polygon must ALSO have the same transform.
             
             const headLen = 10 * (o.strokeWidth || 1) * 0.5 + 5;
             const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
             const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
             const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
             const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
             
             content += `\n<polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${o.stroke || "black"}"${transform} />`;
        }
        if (o.arrowStart) {
             const angle = Math.atan2(y2 - o.y, x2 - o.x);
             const headLen = 10 * (o.strokeWidth || 1) * 0.5 + 5;
             const ax1 = o.x + headLen * Math.cos(angle - Math.PI / 6);
             const ay1 = o.y + headLen * Math.sin(angle - Math.PI / 6);
             const ax2 = o.x + headLen * Math.cos(angle + Math.PI / 6);
             const ay2 = o.y + headLen * Math.sin(angle + Math.PI / 6);
             content += `\n<polygon points="${o.x},${o.y} ${ax1},${ay1} ${ax2},${ay2}" fill="${o.stroke || "black"}"${transform} />`;
        }
        
      } else if (o.type === "path" && o.pathNodes && o.pathNodes.length > 0) {
        let d = `M ${o.pathNodes[0].x} ${o.pathNodes[0].y}`;
        for (let i = 1; i < o.pathNodes.length; i++) {
            const prev = o.pathNodes[i-1];
            const curr = o.pathNodes[i];
            const cp1x = prev.cp2x ?? prev.x;
            const cp1y = prev.cp2y ?? prev.y;
            const cp2x = curr.cp1x ?? curr.x;
            const cp2y = curr.cp1y ?? curr.y;
            if (prev.cp2x !== undefined || curr.cp1x !== undefined) {
                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
            } else {
                d += ` L ${curr.x} ${curr.y}`;
            }
        }
        if (o.closed && o.pathNodes.length > 2) {
            const prev = o.pathNodes[o.pathNodes.length-1];
            const curr = o.pathNodes[0];
            const cp1x = prev.cp2x ?? prev.x;
            const cp1y = prev.cp2y ?? prev.y;
            const cp2x = curr.cp1x ?? curr.x;
            const cp2y = curr.cp1y ?? curr.y;
            if (prev.cp2x !== undefined || curr.cp1x !== undefined) {
                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${curr.x} ${curr.y}`;
            }
            d += " Z";
        }
        content = `<path d="${d}" fill="${o.fill || "transparent"}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}"${transform} />`;
      } else if (o.type === "text" && o.text) {
        content = `<text x="${o.x}" y="${o.y}" font-family="${o.fontFamily}" font-size="${o.fontSize}" font-weight="${o.fontWeight}" font-style="${o.fontStyle}" fill="${o.fill}" dominant-baseline="hanging"${transform}>${o.text}</text>`;
      } else if (o.type === "label" && o.text) {
          // Label is just text
          const fontSize = o.fontSize || 24;
          const fontWeight = o.fontWeight || "bold";
          content = `<text x="${o.x}" y="${o.y}" font-family="${o.fontFamily ?? "sans-serif"}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${o.fill}" dominant-baseline="hanging"${transform}>${o.text}</text>`;
      } else if (o.type === "scalebar") {
          // Scalebar group: rect + text
          const barH = o.strokeWidth || 4;
          const color = o.stroke || "#000";
          content = `<rect x="${o.x}" y="${o.y + o.height - barH}" width="${o.width}" height="${barH}" fill="${color}"${transform} />`;
          
          if (o.labelPosition !== "none") {
             const label = `${o.physicalLength} ${o.units || "units"}`;
             const fSize = o.fontSize || 14;
             // Text centered above
             const tx = o.x + o.width / 2;
             const ty = o.y + o.height - barH - 2;
             content += `\n<text x="${tx}" y="${ty}" font-family="Arial" font-size="${fSize}" fill="${color}" text-anchor="middle"${transform}>${label}</text>`;
          }
      } else if (o.type === "image" && o.src) {
        // Embed image as base64?
        // For SVG, we can use <image href="data:...">
        // We assume o.src is already a suitable URL (blob or data).
        // If blob, simple SVG string might fail to load it if not embedded.
        // We might need to convert blob/asset URL to data64 for portable SVG.
        // For now, use href.
        content = `<image x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" href="${o.src}"${transform} />`;
      }
      return content;
    };

    svgContent += objects.map(objToSVG).join("\n");
    svgContent += "\n</svg>";
    
    return new Blob([svgContent], { type: "image/svg+xml" });
}

async function exportRaster(
    objects: CanvasObject[], 
    bounds: { minX: number, minY: number, width: number, height: number },
    options: ExportOptions,
    imageCache: Map<string, HTMLImageElement>
): Promise<Blob | null> {
    const { minX, minY, width, height } = bounds;
    
    // Scale factor
    const scale = options.dpi / 72;
    
    const w = Math.ceil(width * scale);
    const h = Math.ceil(height * scale);
    
    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    
    // Scale and Translate
    ctx.scale(scale, scale);
    ctx.translate(-minX, -minY);
    
    // Fill background if not transparent
    if (!options.transparent) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(minX, minY, width, height); // Fill visual area in world coordinates
    }
    
    // Render
    objects.forEach(obj => drawObject(ctx, obj, imageCache));
    
    if (options.format === 'tiff') {
        const imageData = ctx.getImageData(0, 0, w, h);
        return encodeTIFF(imageData, options.dpi);
    } else {
        // PNG default
        return new Promise<Blob | null>((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/png");
        });
    }
}

/**
 * Simple Uncompressed Baseline TIFF Encoder (RGB)
 */
function encodeTIFF(imageData: ImageData, dpi: number): Blob {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data; // RGBA
    
    // We will write RGB (3 bytes per pixel) or RGBA. 
    // Baseline TIFF usually supports RGB. Alpha requires extra tags.
    // Let's stick to RGB for generic compatibility, or ARGB if we want transparency.
    // "ExtraSamples" tag for alpha.
    // Let's write RGB for now (strip alpha) to be safe/simple, or handling alpha?
    // Let's try RGB first.
    
    // Structure: Header (8 bytes) + IFD (Entry count + Entries + Next) + Values + Pixel Data
    // We'll put Pixel Data at the end or beginning?
    // Let's put Header -> IFD -> Values -> Pixel Data
    
    // IFD Entries we need:
    // 256 ImageWidth (Short/Long)
    // 257 ImageHeight (Short/Long)
    // 258 BitsPerSample (Short, 3 values: 8,8,8)
    // 259 Compression (Short, 1 = None)
    // 262 PhotometricInterpretation (Short, 2 = RGB)
    // 273 StripOffsets (Long, 1 value)
    // 277 SamplesPerPixel (Short, 3)
    // 278 RowsPerStrip (Short, height)
    // 279 StripByteCounts (Long, 1 value: width*height*3)
    // 282 XResolution (Rational)
    // 283 YResolution (Rational)
    // 296 ResolutionUnit (Short, 2 = Inch)
    
    // Total entries: 11
    
    const entries = 11;
    const ifdSize = 2 + entries * 12 + 4; // count + entries + next
    const headerSize = 8;
    
    // Values that don't fit in 4 bytes need offset.
    // BitsPerSample (8,8,8) -> 6 bytes (Short*3). Needs offset.
    // XResolution (Rational 8 bytes). Needs offset.
    // YResolution (Rational 8 bytes). Needs offset.
    
    // Offsets calculation
    const ifdOffset = headerSize; 
    const valuesOffset = ifdOffset + ifdSize;
    let currentOffset = valuesOffset;
    
    // BitsPerSample data
    const bitsPerSampleOffset = currentOffset;
    currentOffset += 6; // 3 * 2 bytes
    
    // XRes data
    const xResOffset = currentOffset;
    currentOffset += 8; // 2 * 4 bytes
    
    // YRes data
    const yResOffset = currentOffset;
    currentOffset += 8;
    
    // StripOffsets data (Image data starts here)
    const stripOffset = currentOffset;
    const pixelDataSize = width * height * 3;
    const fileSize = stripOffset + pixelDataSize;
    
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    
    let pos = 0;
    
    // Header (Little Endian "II")
    view.setUint16(0, 0x4949, true); // "II"
    view.setUint16(2, 42, true);     // 42
    view.setUint32(4, ifdOffset, true); // Offset to IFD
    
    pos = ifdOffset;
    
    // IFD Count
    view.setUint16(pos, entries, true);
    pos += 2;
    
    function writeEntry(tag: number, type: number, count: number, value: number) {
        view.setUint16(pos, tag, true);
        view.setUint16(pos + 2, type, true);
        view.setUint32(pos + 4, count, true);
        if (count * (type === 3 ? 2 : (type === 4 ? 4 : 1)) > 4) {
            view.setUint32(pos + 8, value, true); // It's an offset
        } else {
             // Value fits
             view.setUint32(pos + 8, value, true);
        }
        pos += 12;
    }
    
    // Write Entries (MUST BE SORTED BY TAG ID)
    
    // 256 ImageWidth
    writeEntry(256, 4, 1, width); // Long
    
    // 257 ImageHeight
    writeEntry(257, 4, 1, height); // Long
    
    // 258 BitsPerSample (Offset)
    writeEntry(258, 3, 3, bitsPerSampleOffset);
    
    // 259 Compression (1 = None)
    writeEntry(259, 3, 1, 1);
    
    // 262 PhotometricInterpretation (2 = RGB)
    writeEntry(262, 3, 1, 2);
    
    // 273 StripOffsets
    writeEntry(273, 4, 1, stripOffset);
    
    // 277 SamplesPerPixel (3)
    writeEntry(277, 3, 1, 3);
    
    // 278 RowsPerStrip (height)
    writeEntry(278, 4, 1, height);
    
    // 279 StripByteCounts
    writeEntry(279, 4, 1, pixelDataSize);
    
    // 282 XResolution
    writeEntry(282, 5, 1, xResOffset);
    
    // 283 YResolution
    writeEntry(283, 5, 1, yResOffset);
    
    // 296 ResolutionUnit (2 = Inch)
    writeEntry(296, 3, 1, 2);
    
    // Next IFD
    view.setUint32(pos, 0, true);
    
    // Write Value Data
    
    // BitsPerSample: 8, 8, 8
    view.setUint16(bitsPerSampleOffset, 8, true);
    view.setUint16(bitsPerSampleOffset + 2, 8, true);
    view.setUint16(bitsPerSampleOffset + 4, 8, true);
    
    // XResolution: DPI / 1
    view.setUint32(xResOffset, dpi, true);     // Numerator
    view.setUint32(xResOffset + 4, 1, true);   // Denominator
    
    // YResolution: DPI / 1
    view.setUint32(yResOffset, dpi, true);
    view.setUint32(yResOffset + 4, 1, true);
    
    // Write Pixel Data (RGB) at stripOffset
    let p = stripOffset;
    for (let i = 0; i < data.length; i += 4) {
        // data is RGBA, we write RGB
        view.setUint8(p++, data[i]);     // R
        view.setUint8(p++, data[i + 1]); // G
        view.setUint8(p++, data[i + 2]); // B
        // Skip Alpha (data[i+3])
    }
    
    return new Blob([buffer], { type: "image/tiff" });
}
