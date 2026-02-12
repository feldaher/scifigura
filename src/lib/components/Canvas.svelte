<script lang="ts">
  import { onMount } from "svelte";

  // Props
  let { width = 800, height = 600 } = $props();

  // Types
  interface CanvasObject {
    id: string;
    type: "rectangle" | "ellipse" | "line" | "text" | "group";
    x: number;
    y: number;
    width: number;
    height: number;
    // For groups
    children?: CanvasObject[];

    // For lines
    x2?: number;
    y2?: number;
    arrowStart?: boolean;
    arrowEnd?: boolean;

    // For text
    text?: string;
    fontSize?: number;
    fontFamily?: string;

    fill: string;
    stroke?: string;
    strokeWidth?: number;

    // Transformations
    rotation?: number; // In radians
  }

  // State
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let zoom = $state(1.0);
  let offset = $state({ x: 0, y: 0 });

  let isDragging = $state(false);
  let dragStart = { x: 0, y: 0 };
  let lastMousePos = $state({ x: 0, y: 0 });

  // Selection State
  let objects = $state<CanvasObject[]>([]); // Empty start
  let selectedIds = $state<Set<string>>(new Set());
  let selectionRect = $state<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Interaction State
  let activeHandle: string | null = null;
  let hoveredHandle = $state<string | null>(null);
  let initialState: CanvasObject | null = null; // Snapshot for resize/rotate

  // History State
  let history = $state<CanvasObject[][]>([[]]); // Start with empty state
  let historyIndex = $state(0);

  function saveHistory() {
    // Remove any future history if we were in the middle of the stack
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    // Push deep copy of current objects
    history.push(JSON.parse(JSON.stringify(objects)));
    historyIndex++;

    // Limit history size (optional, say 50 steps)
    if (history.length > 50) {
      history.shift();
      historyIndex--;
    }
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      objects = JSON.parse(JSON.stringify(history[historyIndex]));
      selectedIds.clear(); // Clear selection on undo for simplicity
      selectedIds = new Set(selectedIds);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      objects = JSON.parse(JSON.stringify(history[historyIndex]));
      selectedIds.clear();
      selectedIds = new Set(selectedIds);
    }
  }

  // Interaction Mode
  type InteractionMode =
    | "pan"
    | "select"
    | "move"
    | "resize"
    | "marquee"
    | "draw_rectangle"
    | "draw_ellipse"
    | "draw_line"
    | "draw_text"
    | "rotate";
  let mode = $state<InteractionMode>("select"); // Default to select mode

  // Drawing State
  let pendingObject = $state<CanvasObject | null>(null);

  // Text Input State
  let textInput = $state({
    visible: false,
    x: 0,
    y: 0,
    value: "",
    worldX: 0,
    worldY: 0,
  });
  let textInputRef: HTMLInputElement;

  // Settings
  let showGrid = $state(true);
  let snapToGrid = $state(false);
  let gridSize = 10; // 10mm grid
  const RULER_SIZE = 20;

  // Constants
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 32.0;
  const ZOOM_SENSITIVITY = 0.001;

  onMount(() => {
    ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initial size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Initial center
    centerCanvas();

    // Start render loop
    let frameId: number;
    const loop = () => {
      render();
      frameId = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(frameId);
  });

  function centerCanvas() {
    // Determine container size (or use window size for now)
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    offset.x = (containerWidth - width * zoom) / 2 + RULER_SIZE;
    offset.y = (containerHeight - height * zoom) / 2 + RULER_SIZE;
  }

  function render() {
    if (!ctx || !canvas) return;

    // Clear visible area
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1e1e1e"; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Paper & Grid (World Space)
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Draw "Paper" (The actual document area)
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 20;
    ctx.fillRect(0, 0, width, height);
    ctx.shadowBlur = 0; // Reset shadow

    // Draw Grid (on top of paper)
    if (showGrid) {
      drawGrid(ctx);
    }

    // Draw Objects
    for (const obj of objects) {
      drawObject(ctx, obj);
    }

    // Draw Pending Object (being drawn)
    if (pendingObject) {
      drawObject(ctx, pendingObject);
    }

    // Draw Selection Overlay
    drawSelectionOverlay(ctx);

    ctx.restore();

    // 2. Draw Rulers (Screen Space / Mixed)
    drawRulers(ctx);
  }

  function drawObject(ctx: CanvasRenderingContext2D, obj: CanvasObject) {
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
    } else if (obj.type === "text" && obj.text) {
      ctx.font = `${obj.fontSize || 16}px ${obj.fontFamily || "sans-serif"}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = obj.fill;
      ctx.fillText(obj.text, obj.x, obj.y);

      // Measure text for selection box
      const metrics = ctx.measureText(obj.text);
      obj.width = metrics.width;
      obj.height = obj.fontSize || 16; // Approx height
    } else if (obj.type === "group" && obj.children) {
      // Recursively draw children
      for (const child of obj.children) {
        drawObject(ctx, child);
      }
      // Optionally draw a bounding box hint if selected, but that's handled by drawSelectionOverlay
      return;
    }

    if (obj.type !== "line" && obj.type !== "text" && obj.type !== "group") {
      // Fill for shapes
      ctx.fillStyle = obj.fill;
      ctx.fill();
    }

    if (obj.stroke || obj.type === "line") {
      ctx.strokeStyle = obj.stroke || "#000";
      ctx.lineWidth = obj.strokeWidth || 1;
      ctx.stroke();
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

  function drawSelectionOverlay(ctx: CanvasRenderingContext2D) {
    if (selectedIds.size === 0) return;

    ctx.save();
    ctx.strokeStyle = "#2196f3";
    ctx.lineWidth = 1 / zoom;

    // Handle single selection with rotation separate from multi-selection (axis aligned)
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      const obj = objects.find((o) => o.id === id);
      if (obj) {
        // Calculate center
        let cx = obj.x + obj.width / 2;
        let cy = obj.y + obj.height / 2;
        if (
          obj.type === "line" &&
          obj.x2 !== undefined &&
          obj.y2 !== undefined
        ) {
          cx = (obj.x + obj.x2) / 2;
          cy = (obj.y + obj.y2) / 2;
        }

        ctx.translate(cx, cy);
        ctx.rotate(obj.rotation || 0);
        ctx.translate(-cx, -cy);

        // Draw bounding box (local space)
        let bx = obj.x,
          by = obj.y,
          bw = obj.width,
          bh = obj.height;
        if (
          obj.type === "line" &&
          obj.x2 !== undefined &&
          obj.y2 !== undefined
        ) {
          // For line, bounding box is min/max
          bx = Math.min(obj.x, obj.x2);
          by = Math.min(obj.y, obj.y2);
          bw = Math.abs(obj.x - obj.x2);
          bh = Math.abs(obj.y - obj.y2);
        }
        ctx.strokeRect(bx, by, bw, bh);

        // Draw Resize Handles (8)
        const handleSize = 8 / zoom;
        const hHalf = handleSize / 2;

        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";

        // Corners: NW, NE, SE, SW
        const corners = [
          { x: bx, y: by }, // NW
          { x: bx + bw, y: by }, // NE
          { x: bx + bw, y: by + bh }, // SE
          { x: bx, y: by + bh }, // SW
          // Sides: N, E, S, W
          { x: bx + bw / 2, y: by }, // N
          { x: bx + bw, y: by + bh / 2 }, // E
          { x: bx + bw / 2, y: by + bh }, // S
          { x: bx, y: by + bh / 2 }, // W
        ];

        corners.forEach((p) => {
          ctx.beginPath();
          ctx.rect(p.x - hHalf, p.y - hHalf, handleSize, handleSize);
          ctx.fill();
          ctx.stroke();
        });

        // Draw Rotate Handle (Top)
        const rotDist = 20 / zoom;
        const rx = bx + bw / 2;
        const ry = by - rotDist;

        ctx.beginPath();
        ctx.moveTo(rx, by);
        ctx.lineTo(rx, ry);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rx, ry, handleSize / 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Multi-selection: Axis-aligned bounding box of all
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      for (const obj of objects) {
        if (selectedIds.has(obj.id)) {
          let ox = obj.x,
            oy = obj.y,
            ow = obj.width,
            oh = obj.height;
          if (
            obj.type === "line" &&
            obj.x2 !== undefined &&
            obj.y2 !== undefined
          ) {
            ox = Math.min(obj.x, obj.x2);
            oy = Math.min(obj.y, obj.y2);
            ow = Math.abs(obj.x - obj.x2);
            oh = Math.abs(obj.y - obj.y2);
          }
          minX = Math.min(minX, ox);
          minY = Math.min(minY, oy);
          maxX = Math.max(maxX, ox + ow);
          maxY = Math.max(maxY, oy + oh);
        }
      }
      if (minX !== Infinity) {
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      }
    }

    ctx.restore();
    ctx.restore();

    // Marquee Selection
    if (selectionRect) {
      ctx.save();
      ctx.fillStyle = "rgba(33, 150, 243, 0.2)";
      ctx.strokeStyle = "#2196F3";
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(
        selectionRect.x,
        selectionRect.y,
        selectionRect.w,
        selectionRect.h,
      );
      ctx.strokeRect(
        selectionRect.x,
        selectionRect.y,
        selectionRect.w,
        selectionRect.h,
      );
      ctx.restore();
    }
  }

  function drawGrid(context: CanvasRenderingContext2D) {
    context.strokeStyle = "#e0e0e0";
    context.lineWidth = 1 / zoom; // Keep grid lines thin

    context.beginPath();
    // Vertical lines
    for (let x = 0; x <= width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    // Horizontal lines
    for (let y = 0; y <= height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
  }

  function drawRulers(ctx: CanvasRenderingContext2D) {
    // Top ruler background
    ctx.fillStyle = "#2d2d2d";
    ctx.fillRect(0, 0, canvas.width, RULER_SIZE);
    // Left ruler background
    ctx.fillRect(0, 0, RULER_SIZE, canvas.height);

    ctx.strokeStyle = "#888";
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.lineWidth = 1;

    // --- Top Ruler (X) ---
    ctx.beginPath();

    const startWorldX = (RULER_SIZE - offset.x) / zoom;
    const endWorldX = (canvas.width - offset.x) / zoom;

    // Determine step size based on zoom
    let step = 10; // default 10mm
    if (zoom > 2) step = 1;
    if (zoom < 0.5) step = 50;
    if (zoom < 0.1) step = 100;

    // Align to step
    const firstTick = Math.floor(startWorldX / step) * step;

    for (let x = firstTick; x <= endWorldX; x += step) {
      const screenX = x * zoom + offset.x;
      if (screenX < RULER_SIZE) continue;

      // Major vs Minor ticks
      const isMajor = x % (step * 5) === 0 || x === 0;
      const tickHeight = isMajor ? RULER_SIZE : RULER_SIZE / 2;

      ctx.moveTo(screenX, RULER_SIZE);
      ctx.lineTo(screenX, RULER_SIZE - tickHeight);

      if (isMajor) {
        ctx.fillText(x.toString(), screenX + 2, RULER_SIZE / 2);
      }
    }
    ctx.stroke();

    // --- Left Ruler (Y) ---
    ctx.beginPath();
    const startWorldY = (RULER_SIZE - offset.y) / zoom;
    const endWorldY = (canvas.height - offset.y) / zoom;

    const firstTickY = Math.floor(startWorldY / step) * step;

    for (let y = firstTickY; y <= endWorldY; y += step) {
      const screenY = y * zoom + offset.y;
      if (screenY < RULER_SIZE) continue;

      const isMajor = y % (step * 5) === 0 || y === 0;
      const tickWidth = isMajor ? RULER_SIZE : RULER_SIZE / 2;

      ctx.moveTo(RULER_SIZE, screenY);
      ctx.lineTo(RULER_SIZE - tickWidth, screenY);

      if (isMajor) {
        ctx.save();
        ctx.translate(RULER_SIZE / 2, screenY + 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(y.toString(), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();

    // Corner box
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  }

  function groupSelected() {
    if (selectedIds.size < 2) return; // Need at least 2 to group

    const selectedObjects: CanvasObject[] = [];
    const nonSelectedObjects: CanvasObject[] = [];
    const newSelectedIds = new Set<string>();

    // Separate objects
    for (const obj of objects) {
      if (selectedIds.has(obj.id)) {
        selectedObjects.push(obj);
      } else {
        nonSelectedObjects.push(obj);
      }
    }

    if (selectedObjects.length === 0) return;

    // Calculate Bounding Box for the Group
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    // Helper to expand bbox
    const expand = (o: CanvasObject) => {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width);
      maxY = Math.max(maxY, o.y + o.height);
      if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
        minX = Math.min(minX, o.x2);
        minY = Math.min(minY, o.y2);
        maxX = Math.max(maxX, o.x2);
        maxY = Math.max(maxY, o.y2);
      }
    };

    for (const obj of selectedObjects) {
      expand(obj);
    }

    const groupObj: CanvasObject = {
      id: crypto.randomUUID(),
      type: "group",
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      children: selectedObjects,
      fill: "transparent", // Groups don't have fill usually
    };

    // Replace objects
    objects = [...nonSelectedObjects, groupObj];
    selectedIds.clear();
    selectedIds.add(groupObj.id);
    selectedIds = new Set(selectedIds);
    saveHistory();
  }

  function ungroupSelected() {
    if (selectedIds.size === 0) return;

    let changed = false;
    let newObjects = [...objects];
    const newSelectedIds = new Set<string>();

    // We need to handle this carefully to preserve order if possible,
    // or just append to end/replace in place.
    // For simplicity: Iterate, if group is selected, replace with children.

    const finalObjects: CanvasObject[] = [];

    for (const obj of objects) {
      if (selectedIds.has(obj.id) && obj.type === "group" && obj.children) {
        // Ungroup this
        finalObjects.push(...obj.children);
        for (const child of obj.children) {
          newSelectedIds.add(child.id);
        }
        changed = true;
      } else {
        // Keep
        finalObjects.push(obj);
        if (selectedIds.has(obj.id)) {
          newSelectedIds.add(obj.id);
        }
      }
    }

    if (changed) {
      objects = finalObjects;
      selectedIds = newSelectedIds;
      selectedIds = new Set(selectedIds);
      saveHistory();
    }
  }

  // --- Helper Functions ---

  function worldToScreen(x: number, y: number) {
    return {
      x: x * zoom + offset.x,
      y: y * zoom + offset.y,
    };
  }

  function screenToWorld(x: number, y: number) {
    return {
      x: (x - offset.x) / zoom,
      y: (y - offset.y) / zoom,
    };
  }

  // Helper to get handle under mouse
  function getHandleAtPosition(worldX: number, worldY: number): string | null {
    if (selectedIds.size !== 1) return null; // Only single select for now

    const id = Array.from(selectedIds)[0];
    const obj = objects.find((o) => o.id === id);
    if (!obj) return null;

    const handleSize = 8 / zoom;
    const hHit = handleSize; // Hit area

    // Transform mouse into object local space
    let cx = obj.x + obj.width / 2;
    let cy = obj.y + obj.height / 2;
    if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
      cx = (obj.x + obj.x2) / 2;
      cy = (obj.y + obj.y2) / 2;
    }

    const dx = worldX - cx;
    const dy = worldY - cy;

    // Rotate backwards
    const angle = -(obj.rotation || 0);
    const lx = dx * Math.cos(angle) - dy * Math.sin(angle) + cx;
    const ly = dx * Math.sin(angle) + dy * Math.cos(angle) + cy;

    // Now check against unrotated bounds handles
    let bx = obj.x,
      by = obj.y,
      bw = obj.width,
      bh = obj.height;
    if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
      bx = Math.min(obj.x, obj.x2);
      by = Math.min(obj.y, obj.y2);
      bw = Math.abs(obj.x - obj.x2);
      bh = Math.abs(obj.y - obj.y2);
    }

    // Check handles
    const check = (hx: number, hy: number) => {
      return Math.abs(lx - hx) <= hHit && Math.abs(ly - hy) <= hHit;
    };

    if (check(bx, by)) return "nw";
    if (check(bx + bw, by)) return "ne";
    if (check(bx + bw, by + bh)) return "se";
    if (check(bx, by + bh)) return "sw";
    if (check(bx + bw / 2, by)) return "n";
    if (check(bx + bw, by + bh / 2)) return "e";
    if (check(bx + bw / 2, by + bh)) return "s";
    if (check(bx, by + bh / 2)) return "w";

    // Rotate handle
    const rx = bx + bw / 2;
    const ry = by - 20 / zoom;
    if (check(rx, ry)) return "rotate";

    return null;
  }

  function hitTest(x: number, y: number): string | null {
    // Recursive helper to check a single object (or group)
    // Returns true if hit.
    const checkHit = (obj: CanvasObject): boolean => {
      if (obj.type === "group" && obj.children) {
        // Check children. If any child is hit, the group is hit.
        for (const child of obj.children) {
          if (checkHit(child)) return true;
        }
        return false;
      }

      if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
        // Line Hit Test
        const A = { x: obj.x, y: obj.y };
        const B = { x: obj.x2, y: obj.y2 };
        const P = { x, y };

        const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
        if (l2 === 0) return false;

        let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const proj = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
        const dist = Math.sqrt((P.x - proj.x) ** 2 + (P.y - proj.y) ** 2);

        return dist <= HIT_TOLERANCE;
      } else {
        // Shape Hit Test
        return (
          x >= obj.x &&
          x <= obj.x + obj.width &&
          y >= obj.y &&
          y <= obj.y + obj.height
        );
      }
    };

    // Iterate in reverse to hit top-most object first
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (checkHit(obj)) {
        return obj.id;
      }
    }
    return null;
  }

  // --- Interaction Handlers ---

  function handleWheel(event: WheelEvent) {
    event.preventDefault();

    if (event.ctrlKey) {
      // Zoom
      const zoomFactor = -event.deltaY * ZOOM_SENSITIVITY;
      const newZoom = Math.min(Math.max(zoom + zoomFactor, MIN_ZOOM), MAX_ZOOM);

      // Calculate mouse position in world coordinates before zoom
      const worldX = (event.clientX - offset.x) / zoom;
      const worldY = (event.clientY - offset.y) / zoom;

      // Apply new zoom
      zoom = newZoom;

      // Adjust offset to keep mouse position stable in world coordinates
      offset.x = event.clientX - worldX * zoom;
      offset.y = event.clientY - worldY * zoom;
    } else {
      // Pan
      offset.x -= event.deltaX;
      offset.y -= event.deltaY;
    }
  }

  function handleMouseDown(event: MouseEvent) {
    const worldPos = screenToWorld(event.clientX, event.clientY);

    // 1. Pan (Middle click or Space+Left)
    if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
      mode = "pan";
      isDragging = true;
      dragStart = { x: event.clientX, y: event.clientY };
      return;
    }

    // 2. Select / Move (Left click, no Space)
    if (event.button === 0 && !isSpacePressed) {
      // Special case: Text Tool (Click to create)
      if (mode === "draw_text") {
        textInput = {
          visible: true,
          x: event.clientX,
          y: event.clientY,
          value: "",
          worldX: worldPos.x,
          worldY: worldPos.y,
        };
        // Focus next tick
        setTimeout(() => textInputRef?.focus(), 10);
        return;
      }

      if (
        mode === "draw_rectangle" ||
        mode === "draw_ellipse" ||
        mode === "draw_line"
      ) {
        // Start drawing
        isDragging = true;
        dragStart = { x: worldPos.x, y: worldPos.y };
        pendingObject = {
          id: crypto.randomUUID(),
          type:
            mode === "draw_rectangle"
              ? "rectangle"
              : mode === "draw_ellipse"
                ? "ellipse"
                : "line",
          x: worldPos.x,
          y: worldPos.y,
          // For Rect/Ellipse
          width: 0,
          height: 0,
          // For Line
          x2: worldPos.x,
          y2: worldPos.y,
          arrowEnd: mode === "draw_line", // Auto-add arrow to end for now

          fill: mode === "draw_rectangle" ? "#dddddd" : "#ccffcc",
          stroke: "#333333",
          strokeWidth: 2,
        };
        // Deselect others while drawing
        selectedIds.clear();
        selectedIds = new Set(selectedIds);
        return;
      }

      // 3. Selection / Interaction
      if (
        mode === "select" ||
        mode === "move" ||
        mode === "resize" ||
        mode === "rotate"
      ) {
        const handle = getHandleAtPosition(worldPos.x, worldPos.y);
        if (handle) {
          // Clicked a handle -> Start resizing or rotating
          if (handle === "rotate") {
            mode = "rotate";
          } else {
            mode = "resize";
            // Store which handle was clicked for use in onMouseMove
            // We can reuse a state variable or add a new one.
            // Let's use 'pendingObject' to store the handle name temporarily?
            // Better to have specific state.
            // For now, let's abuse 'pendingObject' id to store the handle name since it's a string,
            // or just add a temp property.
            // Actually, I'll add a 'activeHandle' state variable.
          }
          activeHandle = handle;
          isDragging = true;
          dragStart = { x: event.clientX, y: event.clientY };

          // Store initial state for all selected objects (needed for relative transforms)
          // For single select (MVP), just store the one object
          const id = Array.from(selectedIds)[0];
          const obj = objects.find((o) => o.id === id);
          if (obj) {
            initialState = JSON.parse(JSON.stringify(obj));
          }
          return;
        }

        const hitId = hitTest(worldPos.x, worldPos.y);
        if (hitId) {
          // Clicked on object
          if (event.shiftKey) {
            // Toggle selection
            if (selectedIds.has(hitId)) {
              selectedIds.delete(hitId);
              selectedIds = new Set(selectedIds); // Trigger reactivity
            } else {
              selectedIds.add(hitId);
              selectedIds = new Set(selectedIds);
            }
          } else {
            // If not already selected, clear others and select this
            if (!selectedIds.has(hitId)) {
              selectedIds.clear();
              selectedIds.add(hitId);
              selectedIds = new Set(selectedIds);
            }
          }

          mode = "move";
          isDragging = true;
          dragStart = { x: event.clientX, y: event.clientY };
        } else {
          // Clicked on empty space
          if (!event.shiftKey) {
            selectedIds.clear();
            selectedIds = new Set(selectedIds);
          }

          mode = "marquee";
          isDragging = true;
          dragStart = { x: worldPos.x, y: worldPos.y }; // Store world pos for marquee start
          selectionRect = { x: worldPos.x, y: worldPos.y, w: 0, h: 0 };
        }
      }
    }
  }

  // Need global keyboard state for Space+Drag. Let's add a simple tracker.
  let isSpacePressed = $state(false);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.code === "Space") {
      isSpacePressed = true;
    }

    // Toggle Grid: Ctrl + G
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyG") {
      if (event.shiftKey) {
        // Toggle Snap: Ctrl + Shift + G
        snapToGrid = !snapToGrid;
      } else {
        // Toggle Grid only
        showGrid = !showGrid;
      }
      event.preventDefault();
    }

    // Undo/Redo: Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      event.preventDefault();
    }
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
      redo();
      event.preventDefault();
    }

    // Group: Ctrl+G
    // Ungroup: Ctrl+Shift+G
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyG") {
      if (event.shiftKey) {
        ungroupSelected();
      } else {
        groupSelected();
      }
      event.preventDefault();
    }

    // Delete
    if (event.code === "Backspace" || event.code === "Delete") {
      if (textInput.visible) return; // Don't delete if editing text

      if (selectedIds.size > 0) {
        saveHistory(); // Save state before deletion

        // Filter out selected objects
        objects = objects.filter((obj) => !selectedIds.has(obj.id));

        selectedIds.clear();
        selectedIds = new Set(selectedIds); // Trigger reactivity

        event.preventDefault();
      }
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.code === "Space") {
      isSpacePressed = false;
    }
  }

  function handleTextInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      if (textInput.value.trim()) {
        const newObj: CanvasObject = {
          id: crypto.randomUUID(),
          type: "text",
          x: textInput.worldX,
          y: textInput.worldY,
          width: 0,
          height: 0,
          text: textInput.value,
          fontSize: 20,
          fontFamily: "Arial",
          fill: "#333333",
        };
        objects.push(newObj);
        selectedIds.clear();
        selectedIds.add(newObj.id);
        selectedIds = new Set(selectedIds);
        saveHistory();
      }
      textInput.visible = false;
      mode = "select";
    } else if (e.key === "Escape") {
      textInput.visible = false;
      mode = "select";
    }
    e.stopPropagation(); // Don't trigger other canvas shortcuts
  }

  function onMouseDown(e: MouseEvent) {
    handleMouseDown(e);
    if (mode === "pan") {
      e.preventDefault(); // Prevent text selection etc
    }
  }

  function onMouseMove(e: MouseEvent) {
    lastMousePos = { x: e.clientX, y: e.clientY };

    if (isDragging) {
      const dx = (e.clientX - lastMousePos.x) / zoom;
      const dy = (e.clientY - lastMousePos.y) / zoom;
      const worldPos = screenToWorld(e.clientX, e.clientY); // Added this line to define worldPos

      if (mode === "pan") {
        offset.x += e.clientX - lastMousePos.x;
        offset.y += e.clientY - lastMousePos.y;
      } else if (mode === "move") {
        // Move all selected objects
        // ... (existing move logic) ...
        const moveObj = (obj: CanvasObject, dx: number, dy: number) => {
          obj.x += dx;
          obj.y += dy;
          if (
            obj.type === "line" &&
            obj.x2 !== undefined &&
            obj.y2 !== undefined
          ) {
            obj.x2 += dx;
            obj.y2 += dy;
          }
          if (obj.type === "group" && obj.children) {
            for (const child of obj.children) {
              moveObj(child, dx, dy);
            }
          }
        };

        for (const obj of objects) {
          if (selectedIds.has(obj.id)) {
            moveObj(obj, dx, dy);
          }
        }
      } else if (mode === "rotate" && activeHandle && initialState) {
        // Rotation Logic
        const obj = objects.find((o) => o.id === initialState!.id);
        if (obj) {
          // Center of object
          let cx = obj.x + obj.width / 2;
          let cy = obj.y + obj.height / 2;
          if (obj.type === "line" && obj.x2) {
            cx = (obj.x + obj.x2) / 2;
            cy = (obj.y + obj.y2) / 2;
          }

          const mouseAngle = Math.atan2(worldPos.y - cy, worldPos.x - cx);
          const startAngle = -Math.PI / 2; // Handle is at top (-90 deg)

          // Angle relative to the handle's "zero" position
          // Actually, simpler: just set rotation to mouse angle + 90 deg
          let newRotation = mouseAngle + Math.PI / 2;

          if (e.shiftKey) {
            // Snap to 15 degrees
            const snap = (15 * Math.PI) / 180;
            newRotation = Math.round(newRotation / snap) * snap;
          }

          obj.rotation = newRotation;
        }
      } else if (mode === "resize" && activeHandle && initialState) {
        // Resize Logic
        const obj = objects.find((o) => o.id === initialState!.id);
        if (obj) {
          // We need to calculate new bounds based on handle movement
          // Complex with rotation!
          // Simplification: valid only for non-rotated objects OR
          // rotate mouse delta into local space

          const angle = -(initialState.rotation || 0); // Un-rotate

          // Delta from DRAG START (not frame-to-frame) to avoid drift
          const totalDx = (e.clientX - dragStart.x) / zoom;
          const totalDy = (e.clientY - dragStart.y) / zoom;

          // Rotate delta into object local space
          const rdx = totalDx * Math.cos(angle) - totalDy * Math.sin(angle);
          const rdy = totalDx * Math.sin(angle) + totalDy * Math.cos(angle);

          let newX = initialState.x;
          let newY = initialState.y;
          let newW = initialState.width;
          let newH = initialState.height;

          // Apply resizing based on handle
          if (activeHandle.includes("w")) {
            newW = initialState.width - rdx;
            newX = initialState.x + rdx;
          }
          if (activeHandle.includes("e")) {
            newW = initialState.width + rdx;
          }
          if (activeHandle.includes("n")) {
            newH = initialState.height - rdy;
            newY = initialState.y + rdy;
          }
          if (activeHandle.includes("s")) {
            newH = initialState.height + rdy;
          }

          // Aspect ratio constraint (Shift)
          if (e.shiftKey) {
            // Keep ratio
            const ratio = initialState.width / initialState.height;
            if (activeHandle.includes("w") || activeHandle.includes("e")) {
              // Width controls height
              // TODO: Simplified aspect ratio logic
            }
          }

          // Apply values, prevent negative size
          if (newW < 1) {
            newW = 1;
            if (activeHandle.includes("w"))
              newX = initialState.x + initialState.width - 1;
          }
          if (newH < 1) {
            newH = 1;
            if (activeHandle.includes("n"))
              newY = initialState.y + initialState.height - 1;
          }

          obj.x = newX;
          obj.y = newY;
          obj.width = newW;
          obj.height = newH;

          if (obj.type === "line") {
            // Line resizing is different, usually endpoint moving
            // For now, treat line as box resizing which scales the line
            // Or disable line resizing handles and use endpoint handles?
            // Let's rely on line endpoint handles (which I should implement separately or integrate here)
            // For now, just scaling bounds
            if (
              initialState.x2 !== undefined &&
              initialState.y2 !== undefined
            ) {
              // Scale line points relative to new box?
              // Complicated.
              // Fallback: If line, do nothing or simple logic.
            }
          }
        }
      } else if (mode === "marquee") {
        // marquee
        if (selectionRect) {
          selectionRect.w = worldPos.x - selectionRect.x;
          selectionRect.h = worldPos.y - selectionRect.y;
        }
      } else if (
        (mode === "draw_rectangle" || mode === "draw_ellipse") &&
        pendingObject
      ) {
        const currentWorld = screenToWorld(e.clientX, e.clientY);
        // Allow drawing in any direction
        pendingObject.x = Math.min(dragStart.x, currentWorld.x);
        pendingObject.y = Math.min(dragStart.y, currentWorld.y);
        pendingObject.width = Math.abs(currentWorld.x - dragStart.x);
        pendingObject.height = Math.abs(currentWorld.y - dragStart.y);
      } else if (mode === "draw_line" && pendingObject) {
        const currentWorld = screenToWorld(e.clientX, e.clientY);
        pendingObject.x2 = currentWorld.x;
        pendingObject.y2 = currentWorld.y;
      }
    } else {
      // Not dragging - update hover state for cursor
      if (
        mode === "select" ||
        mode === "move" ||
        mode === "resize" ||
        mode === "rotate"
      ) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        hoveredHandle = getHandleAtPosition(worldPos.x, worldPos.y);
      } else {
        hoveredHandle = null;
      }
    }
  }

  function onMouseUp() {
    if (mode === "marquee" && selectionRect) {
      // Finalize selection
      // Find objects inside selectionRect
      for (const obj of objects) {
        if (
          obj.x >= selectionRect.x &&
          obj.x + obj.width <= selectionRect.x + selectionRect.w &&
          obj.y >= selectionRect.y &&
          obj.y + obj.height <= selectionRect.y + selectionRect.h
        ) {
          selectedIds.add(obj.id);
        }
      }
      selectedIds = new Set(selectedIds);
      selectionRect = null;
      mode = "select"; // Return to default from marquee
    } else if (
      (mode === "draw_rectangle" ||
        mode === "draw_ellipse" ||
        mode === "draw_line") &&
      pendingObject
    ) {
      // Finalize drawing
      // Check size for rect/ellipse, or length for line
      let valid = false;
      if (mode === "draw_line") {
        const dx = (pendingObject.x2 || 0) - pendingObject.x;
        const dy = (pendingObject.y2 || 0) - pendingObject.y;
        valid = dx * dx + dy * dy > 10; // Min length
      } else {
        valid = pendingObject.width > 0 && pendingObject.height > 0;
      }

      if (valid) {
        objects.push(pendingObject);
        // Select the new object
        selectedIds.clear();
        selectedIds.add(pendingObject.id);
        selectedIds = new Set(selectedIds);
        saveHistory(); // Save state
      }
      pendingObject = null;
      // Keep drawing mode active
    } else if (mode === "move") {
      mode = "select";
      if (isDragging) saveHistory(); // Save state
    }

    isDragging = false;
    if (mode === "pan") mode = "select";
  }
  function exportSVG() {
    // 1. Calculate bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    const expand = (o: CanvasObject) => {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width);
      maxY = Math.max(maxY, o.y + o.height);
      if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
        minX = Math.min(minX, o.x2);
        minY = Math.min(minY, o.y2);
        maxX = Math.max(maxX, o.x2);
        maxY = Math.max(maxY, o.y2);
      }
      if (o.type === "group" && o.children) {
        o.children.forEach(expand);
      }
    };

    objects.forEach(expand);

    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    const w = maxX - minX;
    const h = maxY - minY;

    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      alert("Nothing to export!");
      return;
    }

    // 2. Generate SVG content
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}">\n`;

    const objToSVG = (o: CanvasObject): string => {
      if (o.type === "group" && o.children) {
        return `<g>${o.children.map(objToSVG).join("\n")}</g>`;
      }

      let content = "";
      if (o.type === "rectangle") {
        content = `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="${o.fill}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}" />`;
      } else if (o.type === "ellipse") {
        content = `<ellipse cx="${o.x + o.width / 2}" cy="${o.y + o.height / 2}" rx="${o.width / 2}" ry="${o.height / 2}" fill="${o.fill}" stroke="${o.stroke || "none"}" stroke-width="${o.strokeWidth || 0}" />`;
      } else if (o.type === "line") {
        const x2 = o.x2 ?? o.x;
        const y2 = o.y2 ?? o.y;
        content = `<line x1="${o.x}" y1="${o.y}" x2="${x2}" y2="${y2}" stroke="${o.stroke || "black"}" stroke-width="${o.strokeWidth || 2}" />`;
        // Simple arrowhead (manual)
        if (o.arrowEnd) {
          const angle = Math.atan2(y2 - o.y, x2 - o.x);
          const headLen = 10;
          const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
          const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
          const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
          const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
          content += `\n<polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${o.stroke || "black"}" />`;
        }
      } else if (o.type === "text" && o.text) {
        content = `<text x="${o.x}" y="${o.y}" font-family="${o.fontFamily}" font-size="${o.fontSize}" fill="${o.fill}" dominant-baseline="hanging">${o.text}</text>`;
      }
      return content;
    };

    svgContent += objects.map(objToSVG).join("\n");
    svgContent += "\n</svg>";

    // 3. Download
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scifigura_export.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPNG() {
    // 1. Calculate bounds (Reuse logic or similar)
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const expand = (o: CanvasObject) => {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width);
      maxY = Math.max(maxY, o.y + o.height);
      if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
        minX = Math.min(minX, o.x2);
        minY = Math.min(minY, o.y2);
        maxX = Math.max(maxX, o.x2);
        maxY = Math.max(maxY, o.y2);
      }
      if (o.type === "group" && o.children) o.children.forEach(expand);
    };
    objects.forEach(expand);

    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    const w = maxX - minX;
    const h = maxY - minY;

    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      alert("Nothing to export!");
      return;
    }

    // 2. Create offscreen canvas
    const offCanvas = document.createElement("canvas");
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) return;

    // 3. Render
    // Translate so minX, minY is at 0,0
    offCtx.translate(-minX, -minY);

    objects.forEach((obj) => drawObject(offCtx, obj));

    // 4. Download
    const url = offCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "scifigura_export.png";
    a.click();
  }
</script>

<svelte:window
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  onresize={() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  }}
/>

<div class="toolbar">
  <button class:active={mode === "select"} onclick={() => (mode = "select")}
    >Select</button
  >
  <button
    class:active={mode === "draw_rectangle"}
    onclick={() => (mode = "draw_rectangle")}>Rectangle</button
  >
  <button
    class:active={mode === "draw_ellipse"}
    onclick={() => (mode = "draw_ellipse")}>Ellipse</button
  >
  <button
    class:active={mode === "draw_line"}
    onclick={() => (mode = "draw_line")}>Line</button
  >
  <button
    class:active={mode === "draw_text"}
    onclick={() => (mode = "draw_text")}>Text</button
  >
  <div
    class="divider"
    style="width: 1px; background: #ccc; margin: 0 5px;"
  ></div>
  <button onclick={exportSVG}>Exp SVG</button>
  <button onclick={exportPNG}>Exp PNG</button>
</div>

<!-- 
    Canvas fills the screen. 
    Using visible width/height to fill container.
-->
<canvas
  bind:this={canvas}
  onwheel={handleWheel}
  onmousedown={onMouseDown}
  onmousemove={onMouseMove}
  onmouseup={onMouseUp}
  onmouseleave={onMouseUp}
  style="display: block; width: 100vw; height: 100vh; cursor: {isSpacePressed
    ? isDragging
      ? 'grabbing'
      : 'grab'
    : hoveredHandle
      ? hoveredHandle === 'rotate'
        ? 'alias'
        : `${hoveredHandle}-resize`
      : mode.startsWith('draw')
        ? 'crosshair'
        : 'default'};"
></canvas>

<div class="status-bar">
  Zoom: {Math.round(zoom * 100)}% | World: {Math.round(
    (lastMousePos.x - offset.x) / zoom,
  )}, {Math.round((lastMousePos.y - offset.y) / zoom)}
  | Grid: {showGrid ? "ON" : "OFF"} | Snap: {snapToGrid ? "ON" : "OFF"} | Mode: {mode}
</div>

{#if textInput.visible}
  <input
    bind:this={textInputRef}
    type="text"
    bind:value={textInput.value}
    onkeydown={handleTextInputKeydown}
    style="position: fixed; left: {textInput.x}px; top: {textInput.y}px; z-index: 200; font-size: 20px; font-family: Arial; padding: 2px; border: 1px solid #2196f3; outline: none; background: white; color: black;"
    placeholder="Type text..."
  />
{/if}

<style>
  .toolbar {
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    padding: 5px;
    border-radius: 4px;
    display: flex;
    gap: 5px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    z-index: 100;
  }

  .toolbar button {
    background: #444;
    border: none;
    color: #aaa;
    padding: 5px 10px;
    border-radius: 3px;
    cursor: pointer;
  }

  .toolbar button:hover {
    background: #555;
    color: white;
  }

  .toolbar button.active {
    background: #2196f3;
    color: white;
  }

  .status-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #333;
    color: white;
    padding: 5px 10px;
    font-family: monospace;
    font-size: 12px;
    pointer-events: none; /* Let clicks pass through */
    z-index: 100;
  }
</style>
