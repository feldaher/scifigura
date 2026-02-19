import type { CanvasObject } from '../types';

/**
 * Draws a single object onto the provided canvas context.
 * Handles transformations, shapes, text, images, and recursive groups.
 */
export function drawObject(
  ctx: CanvasRenderingContext2D, 
  obj: CanvasObject, 
  imageCache: Map<string, HTMLImageElement>
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
    ctx.fillStyle = obj.fill;
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
    ctx.fillStyle = obj.fill;
    ctx.fill();
  } else if (obj.type === "line") {
    if (obj.x2 !== undefined && obj.y2 !== undefined) {
      ctx.beginPath();
      ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(obj.x2, obj.y2);
    }
  } else if (obj.type === "label" && obj.text) {
    // Draw text
    const fontSize = obj.fontSize || 24;
    const fontWeight = obj.fontWeight || "bold";
    const fontFamily = obj.fontFamily || "sans-serif";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = obj.fill;
    ctx.fillText(obj.text, obj.x, obj.y);

    const metrics = ctx.measureText(obj.text);
    obj.width = metrics.width;
    obj.height = fontSize;
  } else if (obj.type === "scalebar") {
    // Scale Bar: Text top, Bar bottom
    const barHeight = obj.strokeWidth || 4;
    const color = obj.stroke || "#000";

    // Draw Bar at bottom
    ctx.fillStyle = color;
    ctx.fillRect(obj.x, obj.y + obj.height - barHeight, obj.width, barHeight);

    // Draw Text aligned to bottom of text area (above bar)
    if (obj.showText !== false) {
      const label = `${obj.physicalLength} ${obj.units || "units"}`;
      const fontSize = obj.fontSize || 14;
      ctx.font = `normal ${fontSize}px Arial`;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom"; // Text sits on the baseline
      // Position: Center X, Top of bar - padding
      ctx.fillText(
        label,
        obj.x + obj.width / 2,
        obj.y + obj.height - barHeight - 2,
      );
      ctx.textAlign = "start"; // Reset
    }
    ctx.restore();
    return; // Scalebar handles its own drawing completely
  } else if (obj.type === "text" && obj.text) {
    const fontStyle = obj.fontStyle || "normal";
    const fontWeight = obj.fontWeight || "normal";
    const fontSize = obj.fontSize || 16;
    const fontFamily = obj.fontFamily || "sans-serif";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = obj.fill;
    ctx.fillText(obj.text, obj.x, obj.y);

    // Measure text for selection box
    const metrics = ctx.measureText(obj.text);
    obj.width = metrics.width;
    obj.height = fontSize; // Approx height
  } else if (obj.type === "group" && obj.children) {
    // Recursively draw children
    for (const child of obj.children) {
      drawObject(ctx, child, imageCache);
    }
    ctx.restore();
    return;
  } else if (obj.type === "image" && obj.src) {
    // Draw Image
    let img = imageCache.get(obj.src);
    if (!img) {
      // In render.ts used by export, we might assume images are loaded or load them synchronously if possible?
      // Actually export logic will check image cache first.
      // If used in Canvas.svelte, it handles loading.
      // For now, duplicate exact logic:
      
      // Note: We cannot assign to imageCache if it's a Prop/State from outside easily without return?
      // Actually Map is mutable by reference.
      
      console.log("Loading image for render:", obj.src);
      img = new Image();
      img.src = obj.src;
      img.onload = () => {
        console.log("Image loaded for render:", obj.src);
        // Canvas.svelte logic would trigger re-render here. 
        // We can't easily trigger re-render from here without a callback.
        // But for export, we assume images are loaded.
      };
      img.onerror = (e) => {
        console.error("Failed to load image for render:", obj.src, e);
      };
      imageCache.set(obj.src, img);
    }

    if (img && img.complete) {
      if (img.naturalWidth === 0) {
        console.warn("Image complete but naturalWidth is 0:", obj.src);
      }
      ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
    } else {
      // Placeholder while loading
      ctx.fillStyle = "#ccc";
      ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
      ctx.fillStyle = "#666";
      ctx.font = "12px sans-serif";
      ctx.fillText("Loading...", obj.x + 5, obj.y + 20);
    }
  }

  if (obj.stroke || obj.type === "line") {
    ctx.strokeStyle = obj.stroke || "#000";
    ctx.lineWidth = obj.strokeWidth || 1;
    ctx.setLineDash(obj.lineDash || []);
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
    const headLen = 10 * (obj.strokeWidth || 1) * 0.5 + 5; // Approx size

    ctx.fillStyle = obj.stroke || "#000";

    if (obj.arrowEnd) {
      ctx.beginPath();
      ctx.moveTo(obj.x2, obj.y2);
      ctx.lineTo(
        obj.x2 - headLen * Math.cos(angle - Math.PI / 6),
        obj.y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        obj.x2 - headLen * Math.cos(angle + Math.PI / 6),
        obj.y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    }

    if (obj.arrowStart) {
      ctx.beginPath();
      ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(
        obj.x + headLen * Math.cos(angle - Math.PI / 6),
        obj.y + headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        obj.x + headLen * Math.cos(angle + Math.PI / 6),
        obj.y + headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
