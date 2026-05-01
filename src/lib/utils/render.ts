import type { CanvasObject, GlobalTheme } from '../types';

const filterCache = new Map<string, HTMLCanvasElement>();

function getFilteredImage(img: HTMLImageElement, b: number, c: number): HTMLImageElement | HTMLCanvasElement {
  if (b === 100 && c === 100) return img;
  
  const key = `${img.src}_${b}_${c}`;
  const cached = filterCache.get(key);
  if (cached) return cached;
  
  // Clean up old entries for this exact image source to prevent memory leak while dragging sliders
  for (const k of filterCache.keys()) {
    if (k.startsWith(img.src + "_")) {
      filterCache.delete(k);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return img;
  
  ctx.drawImage(img, 0, 0);
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    
    const brightnessOffset = (b - 100) * 2.55; 
    const contrastFactor = Math.max(0, c / 100);
    const intercept = 128 * (1 - contrastFactor);
    
    for (let i = 0; i < data.length; i += 4) {
      data[i]   = data[i]   * contrastFactor + intercept + brightnessOffset;
      data[i+1] = data[i+1] * contrastFactor + intercept + brightnessOffset;
      data[i+2] = data[i+2] * contrastFactor + intercept + brightnessOffset;
    }
    
    ctx.putImageData(imgData, 0, 0);
    filterCache.set(key, canvas);
    return canvas;
  } catch (err) {
    // If canvas is tainted (CORS), pixel manipulation fails. Fallback to original image.
    console.warn("Canvas tainted, cannot apply pixel filters:", err);
    return img;
  }
}

/**
 * Draws a single object onto the provided canvas context.
 * Handles transformations, shapes, text, images, and recursive groups.
 */
export function drawObject(
  ctx: CanvasRenderingContext2D, 
  obj: CanvasObject, 
  imageCache: Map<string, HTMLImageElement>,
  theme: GlobalTheme
) {
  ctx.save();

  // Apply transformations
  // 1. Translate to center
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;

  // For lines, center is mid-point
  let lcx = cx,
    lcy = cy;
  if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
    lcx = (obj.x + obj.x2) / 2;
    lcy = (obj.y + obj.y2) / 2;
  } else if (obj.type === "group") {
    // Groups might have their own x/y/w/h which is the bounding box
    // So cx/cy are correct for the group wrapper
  }

  // Use calculated center for rotation
  const rotCenter =
    obj.type === "line" ? { x: lcx, y: lcy } : { x: cx, y: cy };

  if (obj.rotation) {
    ctx.translate(rotCenter.x, rotCenter.y);
    ctx.rotate(obj.rotation);
    ctx.translate(-rotCenter.x, -rotCenter.y);
  }

  if (obj.type === "rectangle") {
    ctx.beginPath();
    ctx.rect(obj.x, obj.y, obj.width, obj.height);
    ctx.fillStyle = obj.fill ?? theme.fillColor;
    ctx.fill();
  } else if (obj.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      obj.x + obj.width / 2,
      obj.y + obj.height / 2,
      obj.width / 2,
      obj.height / 2,
      0,
      0,
      2 * Math.PI,
    );
    ctx.fillStyle = obj.fill ?? theme.fillColor;
    ctx.fill();
  } else if (obj.type === "arc") {
    const ecx = obj.x + obj.width / 2;
    const ecy = obj.y + obj.height / 2;
    const rx = Math.abs(obj.width / 2);
    const ry = Math.abs(obj.height / 2);
    const sa = obj.startAngle ?? 0;
    const ea = obj.endAngle ?? Math.PI * 2;
    const closure = obj.arcClosed ?? "pie";

    ctx.beginPath();
    if (closure === "pie") {
      ctx.moveTo(ecx, ecy);
      ctx.ellipse(ecx, ecy, rx, ry, 0, sa, ea);
      ctx.closePath();
    } else if (closure === "chord") {
      ctx.ellipse(ecx, ecy, rx, ry, 0, sa, ea);
      ctx.closePath();
    } else {
      // open arc — stroke only
      ctx.ellipse(ecx, ecy, rx, ry, 0, sa, ea);
    }
    const fill = obj.fill ?? theme.fillColor;
    if (fill && fill !== "transparent" && closure !== "open") {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  } else if (obj.type === "line") {

    if (obj.x2 !== undefined && obj.y2 !== undefined) {
      ctx.beginPath();
      ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(obj.x2, obj.y2);
    }
  } else if (obj.type === "label" && obj.text) {
    // Draw text
    const fontSize = obj.fontSize ?? theme.fontSize;
    const fontWeight = obj.fontWeight ?? theme.fontWeight ?? "bold";
    const fontFamily = obj.fontFamily ?? theme.fontFamily;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = obj.fill ?? theme.strokeColor; // Labels use stroke color for text by default in scientific figures if no fill
    ctx.fillText(obj.text, obj.x, obj.y);

    const metrics = ctx.measureText(obj.text);
    obj.width = metrics.width;
    obj.height = fontSize;
  } else if (obj.type === "scalebar") {
    const barHeight = obj.strokeWidth ?? theme.strokeWidth;
    const color = obj.fill ?? obj.stroke ?? theme.strokeColor;
    const label = `${obj.physicalLength || 0} ${obj.units || ""}`;
    const fontSize = obj.fontSize ?? theme.fontSize;
    const fontFamily = obj.fontFamily ?? theme.fontFamily;
    const labelPos = obj.labelPosition || "above";

    ctx.font = `normal ${fontSize}px ${fontFamily}`;
    
    let textWidth = 0;
    let textHeight = 0;
    if (labelPos !== "none") {
      const metrics = ctx.measureText(label);
      textWidth = metrics.width;
      textHeight = fontSize;
    }

    // Treat obj.x and obj.y as the exact top-left of the SCALE BAR itself.
    let barY = obj.y + (obj.height > barHeight ? (obj.height - barHeight) / 2 : 0);
    const centerX = obj.x + obj.width / 2;
    let textY = barY;

    if (labelPos === "above") {
      textY = barY - 4 - textHeight;
    } else if (labelPos === "below") {
      textY = barY + barHeight + 4;
    }

    // Draw Background Box if specified
    if (obj.backgroundColor && obj.backgroundColor !== "transparent") {
      const padding = 6;
      let boxTop = Math.min(barY, labelPos !== "none" ? textY : barY);
      let boxBottom = Math.max(barY + barHeight, labelPos !== "none" ? textY + textHeight : barY + barHeight);
      let boxLeft = Math.min(obj.x, centerX - textWidth / 2);
      let boxRight = Math.max(obj.x + obj.width, centerX + textWidth / 2);

      ctx.save();
      ctx.globalAlpha = obj.backgroundOpacity ?? 1.0;
      ctx.fillStyle = obj.backgroundColor;
      ctx.fillRect(boxLeft - padding, boxTop - padding, (boxRight - boxLeft) + padding * 2, (boxBottom - boxTop) + padding * 2);
      ctx.restore();
    }

    // Draw Text
    if (labelPos !== "none") {
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, centerX, textY);
      ctx.textAlign = "start"; // Reset
    }

    // Draw Bar
    ctx.fillStyle = color;
    ctx.fillRect(obj.x, barY, obj.width, barHeight);

    ctx.restore();
    return; // Scalebar handles its own drawing completely
  } else if (obj.type === "text" && obj.text) {
    const fontStyle = obj.fontStyle ?? theme.fontStyle ?? "normal";
    const fontWeight = obj.fontWeight ?? theme.fontWeight ?? "normal";
    const fontSize = obj.fontSize ?? theme.fontSize;
    const fontFamily = obj.fontFamily ?? theme.fontFamily;
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = obj.fill ?? theme.strokeColor; // Text elements default to stroke color (usually black/dark) if no fill
    ctx.fillText(obj.text, obj.x, obj.y);

    // Measure text for selection box
    const metrics = ctx.measureText(obj.text);
    obj.width = metrics.width;
    obj.height = fontSize; // Approx height
  } else if (obj.type === "group" && obj.children) {
    // Recursively draw children
    for (const child of obj.children) {
      drawObject(ctx, child, imageCache, theme);
    }
    ctx.restore();
    return;
  } else if (obj.type === "path" && obj.pathNodes && obj.pathNodes.length > 0) {
    ctx.beginPath();
    const nodes = obj.pathNodes;
    ctx.moveTo(nodes[0].x, nodes[0].y);
    
    // Draw all segments
    for (let i = 1; i < nodes.length; i++) {
        const prev = nodes[i - 1];
        const curr = nodes[i];
        const cp1x = prev.cp2x ?? prev.x;
        const cp1y = prev.cp2y ?? prev.y;
        const cp2x = curr.cp1x ?? curr.x;
        const cp2y = curr.cp1y ?? curr.y;
        
        if (prev.cp2x !== undefined || curr.cp1x !== undefined) {
             ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, curr.x, curr.y);
        } else {
             ctx.lineTo(curr.x, curr.y);
        }
    }
    
    if (obj.closed && nodes.length > 2) {
        const prev = nodes[nodes.length - 1];
        const curr = nodes[0];
        const cp1x = prev.cp2x ?? prev.x;
        const cp1y = prev.cp2y ?? prev.y;
        const cp2x = curr.cp1x ?? curr.x;
        const cp2y = curr.cp1y ?? curr.y;
        
        if (prev.cp2x !== undefined || curr.cp1x !== undefined) {
             ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, curr.x, curr.y);
        }
        ctx.closePath();
    }
    
    const fill = obj.fill ?? theme.fillColor;
    if (fill && fill !== "transparent") {
       ctx.fillStyle = fill;
       ctx.fill();
    }
  } else if (obj.type === "image" && obj.src) {
    // Draw Image
    let img = imageCache.get(obj.src);
    if (!img) {
      img = new Image();
      img.src = obj.src;
      img.onload = () => {};
      img.onerror = (e) => { console.error("Failed to load image for render:", obj.src, e); };
      imageCache.set(obj.src, img);
    }

    if (img && img.complete) {
      if (img.naturalWidth === 0) {
        console.warn("Image complete but naturalWidth is 0:", obj.src);
      }

      // Apply image adjustments via pixel cache (bypasses browser ctx.filter bugs)
      const b = obj.brightness ?? 100;
      const c = obj.contrast ?? 100;
      const filteredImg = getFilteredImage(img, b, c);

      // Crop support: compute source rect
      const nw = img.naturalWidth || obj.width;
      const nh = img.naturalHeight || obj.height;
      const cl = obj.cropLeft   ?? 0;
      const ct = obj.cropTop    ?? 0;
      const cr = obj.cropRight  ?? 0;
      const cb = obj.cropBottom ?? 0;
      const sx = cl;
      const sy = ct;
      const sw = nw - cl - cr;
      const sh = nh - ct - cb;

      if (sw > 0 && sh > 0) {
        ctx.drawImage(filteredImg, sx, sy, sw, sh, obj.x, obj.y, obj.width, obj.height);
      }
    } else {
      // Placeholder while loading
      ctx.fillStyle = "#ccc";
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.fillStyle = "#666";
      ctx.font = "12px sans-serif";
      ctx.fillText("Loading...", obj.x + 5, obj.y + 20);
    }
  } // end image

  // Resolve effective stroke — must do this BEFORE the guard so theme fallbacks work
  const strokeableTypes = ["rectangle", "ellipse", "arc", "line", "path"];
  const effectiveStroke = obj.stroke ?? (strokeableTypes.includes(obj.type) ? theme.strokeColor : undefined);

  if (effectiveStroke) {
    ctx.strokeStyle = effectiveStroke;
    ctx.lineWidth = obj.strokeWidth ?? theme.strokeWidth;
    ctx.setLineDash(obj.lineDash ?? theme.lineDash ?? []);
    ctx.stroke();
    ctx.setLineDash([]); // Reset to solid
  }

  // Draw Arrowheads
  if (
    obj.type === "line" &&
    (obj.arrowStart || obj.arrowEnd) &&
    obj.x2 !== undefined &&
    obj.y2 !== undefined
  ) {
    const angle = Math.atan2(obj.y2 - obj.y, obj.x2 - obj.x);
    const sw = obj.strokeWidth ?? theme.strokeWidth;
    const headLen = 10 * sw * 0.5 + 7;
    const style = obj.arrowheadStyle ?? "filled";
    const strokeColor = obj.stroke ?? theme.strokeColor;
    const fillColor = obj.arrowFillColor ?? strokeColor;

    function drawHead(tipX: number, tipY: number, ang: number) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = sw;
      ctx.setLineDash([]);

      if (style === "filled") {
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - headLen * Math.cos(ang - Math.PI / 7), tipY - headLen * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(tipX - headLen * Math.cos(ang + Math.PI / 7), tipY - headLen * Math.sin(ang + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
      } else if (style === "open") {
        ctx.beginPath();
        ctx.moveTo(tipX - headLen * Math.cos(ang - Math.PI / 6), tipY - headLen * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(tipX - headLen * Math.cos(ang + Math.PI / 6), tipY - headLen * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
      } else if (style === "diamond") {
        const mid = headLen / 2;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY); // front tip
        ctx.lineTo(tipX - mid * Math.cos(ang - Math.PI / 4), tipY - mid * Math.sin(ang - Math.PI / 4));
        ctx.lineTo(tipX - headLen * Math.cos(ang), tipY - headLen * Math.sin(ang)); // back tip
        ctx.lineTo(tipX - mid * Math.cos(ang + Math.PI / 4), tipY - mid * Math.sin(ang + Math.PI / 4));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (style === "circle") {
        const r = headLen * 0.4;
        const cx = tipX - r * Math.cos(ang);
        const cy = tipY - r * Math.sin(ang);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (style === "bar") {
        const perp = ang + Math.PI / 2;
        const bl = headLen * 0.6;
        ctx.beginPath();
        ctx.moveTo(tipX + bl * Math.cos(perp), tipY + bl * Math.sin(perp));
        ctx.lineTo(tipX - bl * Math.cos(perp), tipY - bl * Math.sin(perp));
        ctx.stroke();
      }
      ctx.restore();
    }

    if (obj.arrowEnd) drawHead(obj.x2, obj.y2, angle);
    if (obj.arrowStart) drawHead(obj.x, obj.y, angle + Math.PI);
  }
  ctx.restore();
}
