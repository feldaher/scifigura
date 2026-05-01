<script lang="ts">
  import { onMount, tick } from "svelte";
  import LayersPanel from "./LayersPanel.svelte";
  import PropertiesPanel from "./PropertiesPanel.svelte";
  import Toolbox from "./Toolbox.svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import AboutDialog from "./AboutDialog.svelte";
  import ScaleBarPromptDialog from "./ScaleBarPromptDialog.svelte";
  import LayoutPresets from "./LayoutPresets.svelte";
    import ReformatDialog from "./ReformatDialog.svelte";
  import PresetManagerDialog from "./PresetManagerDialog.svelte";
  import ValidationPanel from "./ValidationPanel.svelte";
  import { loadCustomPresets, saveCustomPresets, type CustomPreset } from "../utils/presets";
  import type { CanvasObject, GlobalTheme, InteractionMode, ValidationIssue, PathNode } from "../types";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { readFile, writeFile, writeTextFile, readTextFile, exists, remove, BaseDirectory } from "@tauri-apps/plugin-fs";
  import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { drawObject } from "../utils/render";
  import { exportCanvas, type ExportOptions } from "../utils/export";
  import { renderSvgToDataUrl } from "../utils/svg";
  import { renderPdfPageToDataUrl } from "../utils/pdf";
  import { getClosestPointOnPath, splitBezierSegment } from "../utils/bezier";
  import { saveSfsArchive, loadSfsArchive } from "../utils/sfs";

  // Props
  let { width = 800, height = 600 } = $props();

  interface SnapGuide {
    type: "vertical" | "horizontal";
    offset: number; // x or y value
    start: number;
    end: number;
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
  let selectedObjects = $derived(
    objects.filter((obj) => selectedIds.has(obj.id)),
  );
  let selectionRect = $state<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Interaction State
  let isScaleBarPromptOpen = $state(false);
  let scaleBarTargetImage = $state<CanvasObject | null>(null);

  let activeHandle: string | null = null;
  let hoveredHandle = $state<string | null>(null);
  let initialState: CanvasObject | null = null; // Snapshot for resize/rotate
  let selectionSnapshot = $state(
    new Map<string, { x: number; y: number; width?: number; height?: number; x2?: number; y2?: number; pathNodes?: any[] }>(),
  );
  let selectedNodeId = $state<string | null>(null);
  let activeGuides = $state<SnapGuide[]>([]); // Visual guides for snapping

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

  // ── Alignment helpers ──────────────────────────────────────────────────────
  /** Returns the AABB (axis-aligned bounding box) for a canvas object. */
  function getObjectBounds(obj: CanvasObject) {
    if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
      const minX = Math.min(obj.x, obj.x2);
      const minY = Math.min(obj.y, obj.y2);
      return {
        x: minX,
        y: minY,
        w: Math.abs(obj.x2 - obj.x),
        h: Math.abs(obj.y2 - obj.y),
      };
    }
    return { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
  }

  /** Move an object by (dx, dy), translating line endpoints too. */
  function translateObject(obj: CanvasObject, dx: number, dy: number) {
    obj.x += dx;
    obj.y += dy;
    if (obj.x2 !== undefined) obj.x2 += dx;
    if (obj.y2 !== undefined) obj.y2 += dy;
  }

  function alignLeft() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((o) => getObjectBounds(o).x));
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, minX - b.x, 0);
      return copy;
    });
  }

  function alignCenterH() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const bounds = sel.map((o) => getObjectBounds(o));
    const groupLeft = Math.min(...bounds.map((b) => b.x));
    const groupRight = Math.max(...bounds.map((b) => b.x + b.w));
    const centerX = (groupLeft + groupRight) / 2;
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, centerX - (b.x + b.w / 2), 0);
      return copy;
    });
  }

  function alignRight() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const maxX = Math.max(
      ...sel.map((o) => {
        const b = getObjectBounds(o);
        return b.x + b.w;
      }),
    );
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, maxX - (b.x + b.w), 0);
      return copy;
    });
  }

  function alignTop() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const minY = Math.min(...sel.map((o) => getObjectBounds(o).y));
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, 0, minY - b.y);
      return copy;
    });
  }

  function alignMiddleV() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const bounds = sel.map((o) => getObjectBounds(o));
    const groupTop = Math.min(...bounds.map((b) => b.y));
    const groupBottom = Math.max(...bounds.map((b) => b.y + b.h));
    const centerY = (groupTop + groupBottom) / 2;
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, 0, centerY - (b.y + b.h / 2));
      return copy;
    });
  }

  function alignBottom() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const maxY = Math.max(
      ...sel.map((o) => {
        const b = getObjectBounds(o);
        return b.y + b.h;
      }),
    );
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const b = getObjectBounds(o);
      const copy = { ...o };
      translateObject(copy, 0, maxY - (b.y + b.h));
      return copy;
    });
  }

  function distributeH() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 3) return;
    const sorted = [...sel].sort(
      (a, b) => getObjectBounds(a).x - getObjectBounds(b).x,
    );
    const first = getObjectBounds(sorted[0]);
    const last = getObjectBounds(sorted[sorted.length - 1]);
    const totalObjW = sorted.reduce((acc, o) => acc + getObjectBounds(o).w, 0);
    const gap = (last.x + last.w - first.x - totalObjW) / (sorted.length - 1);
    saveHistory();
    let cursor = first.x;
    const offsets = new Map<string, number>();
    for (const obj of sorted) {
      const b = getObjectBounds(obj);
      offsets.set(obj.id, cursor - b.x);
      cursor += b.w + gap;
    }
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const dx = offsets.get(o.id) ?? 0;
      const copy = { ...o };
      translateObject(copy, dx, 0);
      return copy;
    });
  }

  function distributeV() {
    const sel = objects.filter((o) => selectedIds.has(o.id));
    if (sel.length < 3) return;
    const sorted = [...sel].sort(
      (a, b) => getObjectBounds(a).y - getObjectBounds(b).y,
    );
    const first = getObjectBounds(sorted[0]);
    const last = getObjectBounds(sorted[sorted.length - 1]);
    const totalObjH = sorted.reduce((acc, o) => acc + getObjectBounds(o).h, 0);
    const gap = (last.y + last.h - first.y - totalObjH) / (sorted.length - 1);
    saveHistory();
    let cursor = first.y;
    const offsets = new Map<string, number>();
    for (const obj of sorted) {
      const b = getObjectBounds(obj);
      offsets.set(obj.id, cursor - b.y);
      cursor += b.h + gap;
    }
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const dy = offsets.get(o.id) ?? 0;
      const copy = { ...o };
      translateObject(copy, 0, dy);
      return copy;
    });
  }

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
  let textInputRef = $state<HTMLInputElement>();

  // Settings
  let showGrid = $state(true);
  let snapToGrid = $state(false);
  const RULER_SIZE = 20;

  // ── Paper / Canvas Sizes ────────────────────────────────────────────────────
  // Sizes in pixels at 96 DPI (1 pt = 1px). For print output the export
  // pipeline uses its own DPI setting independently.
  const BUILT_IN_SIZES: {
    key: string;
    label: string;
    w: number;
    h: number;
    minFontSizePt?: number;
  }[] = [
    { key: "a4p", label: "A4 Portrait", w: 794, h: 1123 },
    { key: "a4l", label: "A4 Landscape", w: 1123, h: 794 },
    { key: "a3p", label: "A3 Portrait", w: 1123, h: 1587 },
    { key: "a3l", label: "A3 Landscape", w: 1587, h: 1123 },
    { key: "a0p", label: "A0 Poster (portrait)", w: 3179, h: 4494 },
    { key: "letter", label: "US Letter", w: 816, h: 1056 },
    { key: "nature1", label: "Nature 1-col (89mm)", w: 337, h: 252, minFontSizePt: 5 },
    { key: "nature2", label: "Nature 2-col (183mm)", w: 693, h: 520, minFontSizePt: 5 },
    { key: "cell", label: "Cell full page", w: 708, h: 960, minFontSizePt: 7 },
    { key: "pnas", label: "PNAS full page", w: 693, h: 997, minFontSizePt: 7 },
  ];
  
  let customPresets = $state<CustomPreset[]>([]);
  let PAPER_SIZES = $derived([
    ...BUILT_IN_SIZES,
    ...customPresets,
    { key: "custom", label: "Custom…", w: 800, h: 600 }
  ]);
  
  let showPresetManager = $state(false);

  // Load custom presets on mount
  onMount(async () => {
    try {
      customPresets = await loadCustomPresets();
    } catch (e) {
      console.error("Failed to load presets", e);
    }

    if (isTauri()) {
      try {
        const hasRecovery = await exists("recovery.json", { baseDir: BaseDirectory.AppData });
        if (hasRecovery) {
          recoveryData = await readTextFile("recovery.json", { baseDir: BaseDirectory.AppData });
          showRecoveryDialog = true;
        }
      } catch (err) {
        console.error("Recovery check failed:", err);
      }

      // 60-second AutoSave loop
      setInterval(async () => {
        if (showRecoveryDialog) return; // Wait until they decide
        try {
          const data = JSON.stringify(objects, null, 2);
          await writeTextFile("recovery.json", data, { baseDir: BaseDirectory.AppData });
        } catch (err) {
          console.warn("Auto-save failed:", err);
        }
      }, 60000);
    }
  });

  async function handleRecover(accept: boolean) {
    showRecoveryDialog = false;
    if (accept && recoveryData) {
      try {
        objects = JSON.parse(recoveryData);
        saveHistory(); 
      } catch (err) {
        alert("Recovery file was corrupted.");
      }
    }
    recoveryData = null;
    if (isTauri()) {
      await remove("recovery.json", { baseDir: BaseDirectory.AppData }).catch(() => {});
    }
  }

  async function handleSavePresets(newPresets: CustomPreset[]) {
    try {
      await saveCustomPresets(newPresets);
      customPresets = newPresets;
      showPresetManager = false;
      // If the currently selected preset was deleted, fall back to custom
      if (paperKey !== 'custom' && !PAPER_SIZES.find(p => p.key === paperKey)) {
        paperKey = 'custom';
      }
    } catch (err) {
      alert("Failed to save custom presets.");
    }
  }

  let paperKey = $state("a4l");
  let paperW = $derived(PAPER_SIZES.find((p) => p.key === paperKey)?.w ?? 800);
  let paperH = $derived(PAPER_SIZES.find((p) => p.key === paperKey)?.h ?? 600);
  let showLayoutPanel = $state(false);
  // Custom paper size (only used when paperKey === 'custom')
  let customPaperW = $state(800);
  let customPaperH = $state(600);
  // Resolved paper dimensions
  let resolvedW = $derived(paperKey === "custom" ? customPaperW : paperW);
  let resolvedH = $derived(paperKey === "custom" ? customPaperH : paperH);

  // Real-time journal constraints checker
  let validationIssues = $derived.by(() => {
    const issues: ValidationIssue[] = [];
    const preset = PAPER_SIZES.find(p => p.key === paperKey);
    const minFontSize = preset?.minFontSizePt || 0;
    
    for (const obj of objects) {
      if (obj.type === "group" || obj.type === "scalebar") continue;

      let outOfBounds = false;
      if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
          const minX = Math.min(obj.x, obj.x2);
          const maxX = Math.max(obj.x, obj.x2);
          const minY = Math.min(obj.y, obj.y2);
          const maxY = Math.max(obj.y, obj.y2);
          if (minX < 0 || maxX > resolvedW || minY < 0 || maxY > resolvedH) outOfBounds = true;
      } else {
          if (obj.x < 0 || obj.y < 0 || obj.x + obj.width > resolvedW || obj.y + obj.height > resolvedH) outOfBounds = true;
      }
      
      if (outOfBounds) {
        issues.push({ id: crypto.randomUUID(), objectId: obj.id, type: "warning", message: `Object extends outside Canvas margins.` });
      }

      if ((obj.type === "text" || obj.type === "label") && minFontSize > 0) {
        if ((obj.fontSize || 0) < minFontSize) {
          issues.push({ id: crypto.randomUUID(), objectId: obj.id, type: "error", message: `Text size (${obj.fontSize}pt) is below preset minimum (${minFontSize}pt).` });
        }
      }

      if (obj.type === "image" && obj.naturalWidth && obj.width > 0) {
        const effectiveDpi = (obj.naturalWidth / obj.width) * 72;
        if (effectiveDpi && effectiveDpi < 300) {
          issues.push({ id: crypto.randomUUID(), objectId: obj.id, type: "warning", message: `Image degraded. Effective resolution (~${Math.round(effectiveDpi)} DPI) is below 300 DPI standard.` });
        }
      }
    }
    return issues;
  });

  function handleValidationSelect(objectId: string) {
    selectedIds.clear();
    selectedIds.add(objectId);
    selectedIds = new Set(selectedIds);
    // Pan to the selected object
    const obj = objects.find(o => o.id === objectId);
    if (obj) {
      const b = getObjectBounds(obj);
      offset = {
        x: (window.innerWidth / 2) / zoom - (b.x + b.w / 2),
        y: (window.innerHeight / 2) / zoom - (b.y + b.h / 2),
      };
    }
  }

  // ── Reformat Dialog ─────────────────────────────────────────────────────────
  let showReformatDialog = $state(false);
  let pendingPaperKey = $state("");
  let reformatFromLabel = $state("");
  let reformatToLabel = $state("");
  let fontWarnings = $state<string[]>([]);

  function requestPaperChange(newKey: string) {
    if (newKey === paperKey) return;
    if (objects.length === 0) {
      paperKey = newKey;
      tick().then(centerCanvas);
      return;
    }
    reformatFromLabel =
      PAPER_SIZES.find((p) => p.key === paperKey)?.label ?? paperKey;
    reformatToLabel =
      PAPER_SIZES.find((p) => p.key === newKey)?.label ?? newKey;
    pendingPaperKey = newKey;
    showReformatDialog = true;
  }

  function applyReformat() {
    const oldW = resolvedW;
    const oldH = resolvedH;
    const newPreset = PAPER_SIZES.find((p) => p.key === pendingPaperKey);
    if (!newPreset) return;
    const newW = newPreset.w;
    const newH = newPreset.h;
    const sx = newW / oldW;
    const sy = newH / oldH;
    const minFont = newPreset.minFontSizePt;
    const warnings: string[] = [];

    objects = objects.map((obj) => {
      const updated = { ...obj };
      updated.x = Math.round(obj.x * sx);
      updated.y = Math.round(obj.y * sy);

      if (obj.type === "scalebar") {
        updated.width = Math.round(obj.width * sx);
        updated.height = Math.round(obj.height * sy);
        if (obj.offsetX !== undefined) updated.offsetX = obj.offsetX * sx;
        if (obj.offsetY !== undefined) updated.offsetY = obj.offsetY * sy;
      } else if (obj.type === "line") {
        updated.width = Math.round(obj.width * sx);
        updated.height = Math.round(obj.height * sy);
        if (obj.x2 !== undefined) updated.x2 = Math.round(obj.x2 * sx);
        if (obj.y2 !== undefined) updated.y2 = Math.round(obj.y2 * sy);
      } else {
        updated.width = Math.round(obj.width * sx);
        updated.height = Math.round(obj.height * sy);
      }

      if (obj.fontSize) {
        const newFS = Math.max(1, Math.round(obj.fontSize * ((sx + sy) / 2)));
        if (minFont && newFS < minFont) {
          warnings.push(
            `"${obj.text || obj.type}" (${obj.fontSize}pt -> ${newFS}pt, min ${minFont}pt)`,
          );
        }
        updated.fontSize = newFS;
      }

      return updated;
    });

    paperKey = pendingPaperKey;
    fontWarnings = warnings;
    showReformatDialog = false;
    saveHistory();
    tick().then(centerCanvas);
  }

  function cancelReformat() {
    showReformatDialog = false;
    pendingPaperKey = "";
  }

  function applyReflow() {
    const oldW = resolvedW;
    const oldH = resolvedH;
    const newPreset = PAPER_SIZES.find((p) => p.key === pendingPaperKey);
    if (!newPreset) return;
    const newW = newPreset.w;
    const newH = newPreset.h;

    if (objects.length === 0) {
      paperKey = pendingPaperKey;
      showReformatDialog = false;
      tick().then(centerCanvas);
      return;
    }

    // ── Step 1: Spatial-grid clustering ───────────────────────────────────
    // Detects the existing column / row structure purely from object positions.
    // Groups objects that overlap vertically into cohesive "Panels".

    const anchors = objects.filter((o) => !o.parentId); // exclude linked decorations
    if (anchors.length === 0) {
      // Fallback: proportional scale
      const sx2 = newW / oldW, sy2 = newH / oldH;
      objects = objects.map((o) => ({
        ...o,
        x: Math.round(o.x * sx2), y: Math.round(o.y * sy2),
        width: Math.round(o.width * sx2), height: Math.round(o.height * sy2),
      }));
      paperKey = pendingPaperKey;
      showReformatDialog = false;
      saveHistory();
      tick().then(centerCanvas);
      return;
    }

    // Sort by X position first to sweep left-to-right
    const sortedByX = [...anchors].sort((a, b) => a.x - b.x);
    
    interface Panel {
      id: string;
      members: CanvasObject[];
      bbox: { x: number; y: number; w: number; h: number };
    }

    const panels: Panel[] = [];

    // Cluster objects that share horizontal space (overlap in X)
    for (const obj of sortedByX) {
      const objW = obj.width ?? 0;
      const objH = obj.height ?? 0;
      const objMid = obj.x + objW / 2;

      // Find if this object belongs to an existing panel column
      // We say it belongs if its horizontal center falls roughly within a panel's width
      let assigned = false;
      for (const p of panels) {
        if (objMid >= p.bbox.x - 20 && objMid <= p.bbox.x + p.bbox.w + 20) {
          p.members.push(obj);
          p.bbox.x = Math.min(p.bbox.x, obj.x);
          p.bbox.y = Math.min(p.bbox.y, obj.y);
          p.bbox.w = Math.max(p.bbox.x + p.bbox.w, obj.x + objW) - p.bbox.x;
          p.bbox.h = Math.max(p.bbox.y + p.bbox.h, obj.y + objH) - p.bbox.y;
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        panels.push({
          id: obj.id, // anchor id
          members: [obj],
          bbox: { x: obj.x, y: obj.y, w: objW, h: objH }
        });
      }
    }

    // Now sort panels by reading order (top-left)
    panels.sort((a, b) => {
      const rowDiff = Math.round(a.bbox.y / 40) - Math.round(b.bbox.y / 40);
      return rowDiff !== 0 ? rowDiff : a.bbox.x - b.bbox.x;
    });

    // ── Step 2: Compute optimal column count for new canvas ───────────────
    const N = panels.length;
    const gutter = Math.round(newW * 0.04);
    const marginX = Math.round(newW * 0.04);
    const marginY = Math.round(newH * 0.04);
    const newAR = newW / newH;

    function scoreCols(c: number): number {
      const r = Math.ceil(N / c);
      const cw = (newW - marginX * 2 - gutter * (c - 1)) / c;
      const ch = (newH - marginY * 2 - gutter * (r - 1)) / r;
      if (cw <= 0 || ch <= 0) return Infinity;
      return Math.abs(cw / ch - newAR);
    }

    // Try all reasonable column counts and pick the one that fits the new Aspect Ratio best
    let cols = 1;
    let minScore = Infinity;
    for (let c = 1; c <= N; c++) {
      const s = scoreCols(c);
      if (s < minScore) {
        minScore = s;
        cols = c;
      }
    }

    const rows = Math.ceil(N / cols);
    const cellW = Math.round((newW - marginX * 2 - gutter * (cols - 1)) / cols);
    const cellH = Math.round((newH - marginY * 2 - gutter * (rows - 1)) / rows);

    // ── Step 3: Place Panels in new grid, compute per-panel transform ───
    const reflowed = new Map<string, CanvasObject>();
    const FILL = 0.95; // panel fills this fraction of its cell

    panels.forEach((panel, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellX = marginX + col * (cellW + gutter);
      const cellY = marginY + row * (cellH + gutter);

      const oldW2 = panel.bbox.w || 1;
      const oldH2 = panel.bbox.h || 1;
      
      // Scale the whole panel to fit inside the cell
      const scale = Math.min((cellW * FILL) / oldW2, (cellH * FILL) / oldH2);
      const newPanelW = Math.round(oldW2 * scale);
      const newPanelH = Math.round(oldH2 * scale);
      
      // Center the scaled panel exactly in the cell
      const newPanelX = Math.round(cellX + (cellW - newPanelW) / 2);
      const newPanelY = Math.round(cellY + (cellH - newPanelH) / 2);

      // Reposition all members relative to the panel's bounding box top-left
      for (const obj of panel.members) {
        const relX = obj.x - panel.bbox.x;
        const relY = obj.y - panel.bbox.y;
        
        const newObjX = Math.round(newPanelX + relX * scale);
        const newObjY = Math.round(newPanelY + relY * scale);

        reflowed.set(obj.id, {
          ...obj,
          x: newObjX, y: newObjY,
          width: Math.round((obj.width ?? 0) * scale), 
          height: Math.round((obj.height ?? 0) * scale),
          fontSize: obj.fontSize ? Math.max(1, Math.round(obj.fontSize * scale)) : undefined,
        });

        // Reposition decorations linked to this specific object (scale bars, etc.)
        for (const linked of objects.filter((o) => o.parentId === obj.id)) {
          reflowed.set(linked.id, {
            ...linked,
            x: Math.round(newObjX + (linked.x - obj.x) * scale),
            y: Math.round(newObjY + (linked.y - obj.y) * scale),
            width: Math.round((linked.width ?? 0) * scale),
            height: Math.round((linked.height ?? 0) * scale),
            offsetX: linked.offsetX !== undefined ? linked.offsetX * scale : undefined,
            offsetY: linked.offsetY !== undefined ? linked.offsetY * scale : undefined,
            fontSize: linked.fontSize ? Math.max(1, Math.round(linked.fontSize * scale)) : undefined,
          });
        }
      }
    });

    // ── Step 4: Proportionally reposition anything not covered ────────────
    const sx = newW / oldW, sy = newH / oldH;
    for (const obj of objects) {
      if (!reflowed.has(obj.id)) {
        reflowed.set(obj.id, {
          ...obj,
          x: Math.round(obj.x * sx), y: Math.round(obj.y * sy),
          width: Math.round((obj.width ?? 0) * sx), height: Math.round((obj.height ?? 0) * sy),
          fontSize: obj.fontSize ? Math.max(1, Math.round(obj.fontSize * sx)) : undefined,
        });
      }
    }

    objects = objects.map((o) => reflowed.get(o.id) ?? o);
    paperKey = pendingPaperKey;
    showReformatDialog = false;
    fontWarnings = [];
    saveHistory();
    tick().then(centerCanvas);
  }

  // Global Theme
  let globalTheme = $state<GlobalTheme>({
    fontFamily: "Arial",
    fontSize: 12,
    fontWeight: "normal",
    fontStyle: "normal",
    fillColor: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
    lineDash: []
  });

  // Image Import State
  let imageCache = new Map<string, HTMLImageElement>();
  let isDragOver = $state(false);
  let imageInput: HTMLInputElement; // Reference to hidden file input

  // Export State
  let showExportDialog = $state(false);
  let showRecoveryDialog = $state(false);
  let recoveryData = $state<string | null>(null);
  let exportConfig = $state<ExportOptions>({
    format: "png",
    dpi: 300,
  });
  let isExporting = $state(false);

  // Clipboard & Shortcuts
  let clipboard: CanvasObject[] = $state([]);
  let showShortcutsHelp = $state(false);
  let showAboutDialog = $state(false);
  let isPanToolActive = $state(false); // true when P key pan tool is locked on
  let hasStarted = $state(false); // true once user takes any action

  // Context Menu State
  let contextMenu = $state<{
    x: number;
    y: number;
    objectId: string | null;
  } | null>(null);

  function openContextMenu(e: MouseEvent) {
    e.preventDefault();
    // Find object under cursor (if any)
    const wx = (e.offsetX - offset.x) / zoom;
    const wy = (e.offsetY - offset.y) / zoom;
    const hitId = hitTest(wx, wy);
    if (hitId && !selectedIds.has(hitId)) {
      // Select the right-clicked object if not already in selection
      selectedIds = new Set([hitId]);
    }
    contextMenu = { x: e.clientX, y: e.clientY, objectId: hitId };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  // Per-Tool Defaults
  interface ToolStyle {
    fill: string;
    stroke: string;
    strokeWidth: number;
    lineDash: number[];
    // Font props
    fontFamily: string;
    fontSize: number;
    fontWeight: "normal" | "bold";
    fontStyle: "normal" | "italic";
  }

  const defaultToolStyle: ToolStyle = {
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 2,
    lineDash: [],
    fontFamily: "Arial",
    fontSize: 12,
    fontWeight: "normal",
    fontStyle: "normal",
  };

  let toolStyles = $state<Record<string, ToolStyle>>({
    draw_rectangle: { ...defaultToolStyle, fill: "#dddddd", stroke: "#333333" },
    draw_ellipse: { ...defaultToolStyle, fill: "#cccccc", stroke: "#333333" }, // User asked for grey
    draw_arc:     { ...defaultToolStyle, fill: "#cccccc", stroke: "#333333" },
    draw_line: { ...defaultToolStyle, stroke: "#333333" },
    draw_text: { ...defaultToolStyle, fill: "#333333", fontSize: 16 },
    draw_label: {
      ...defaultToolStyle,
      fill: "#000000",
      fontSize: 24,
      fontWeight: "bold",
    }, // User asked for black
    draw_scalebar: {
      ...defaultToolStyle,
      stroke: "#000000",
      strokeWidth: 4,
    } as any,
  });

  // Track active tool style key to avoid updating defaults from selection when drawing
  let activeToolKey = $derived(mode.startsWith("draw_") ? mode : null);

  function loadToolStyles(toolMode: string) {
    const style = toolStyles[toolMode];
    if (style) {
      // With globalTheme, we might not want to clobber the theme just by picking a tool.
      // But toolStyles exist to override theme for specific drawing tools (like rectangles being grey).
      // We'll leave toolStyles alone, they just apply during drawing instead of globalTheme.
    }
  }

  function updateToolStyle(prop: keyof ToolStyle, value: any) {
    if (activeToolKey) {
      toolStyles[activeToolKey] = {
        ...toolStyles[activeToolKey],
        [prop]: value,
      };
    }
  }

  let isSwitchingTool = false;

  // Constants
  const MIN_ZOOM = 0.1;
  const GRID_PRESETS = [5, 10, 20, 50, 100] as const;
  let gridSize = $state(20);
  let gridSizeCustom = $state(20); // used when 'custom' is selected
  let gridSizeKey = $state<number | "custom">(20); // tracks picker value
  $effect(() => {
    gridSize = gridSizeKey === "custom" ? gridSizeCustom : gridSizeKey;
  });
  const HIT_TOLERANCE = 5; // Distance in World Units
  const SNAP_TOLERANCE = 10; // Distance in World Units
  const MAX_ZOOM = 32.0;
  const ZOOM_SENSITIVITY = 0.001;

  // Scientific Features State
  let nextLabelIndex = $state(0);

  function getLabelText(index: number): string {
    // Simple A-Z, then AA, AB...
    // For now, let's just do A-Z
    if (index < 26) return String.fromCharCode(65 + index);
    return (
      String.fromCharCode(65 + Math.floor(index / 26) - 1) +
      String.fromCharCode(65 + (index % 26))
    );
  }

  function resetLabelSequence() {
    nextLabelIndex = 0;
    // Optional: Visual feedback or toast?
    console.log("Label sequence reset to A");
  }

  async function setMode(m: InteractionMode) {
    console.log("setMode called:", m, "isSwitchingTool:", isSwitchingTool);
    if (m.startsWith("draw_")) {
      isSwitchingTool = true;
      console.log("Clearing selection...");
      // Deselect BEFORE switching tool to ensure no styles bleed
      selectedIds.clear();
      selectedIds = new Set(selectedIds);
      await tick(); // Ensure UI updates to 'no selection' state

      console.log("Loading tool styles explicitly while guarded...");
      loadToolStyles(m); // Load styles safely while selection is empty and guard is active

      console.log("Setting mode:", m);
      mode = m;

      // Wait for effects to flush before lifting guard
      await tick();
      isSwitchingTool = false;
      console.log("Tool switch complete. Guard lifted.");
    } else {
      mode = m;
    }
  }

  $effect(() => {
    // INVARIANT ENFORCEMENT:
    // If we are in a drawing mode, there should be NO selection.
    // This protects against style bleeding if tool switching logic is bypassed.
    if (mode.startsWith("draw_") && selectedIds.size > 0) {
      console.warn(
        "Invariant Check: Found selection in Drawing Mode. Clearing.",
      );
      selectedIds.clear();
      selectedIds = new Set(selectedIds);
    }
  });

  $effect(() => {
    // SYNC UI WITH SELECTION
    // Only verify/sync properties if we are in Select Mode and have a selection.
    // This prevents "fighting" with tool defaults when switching tools.
    if (mode === "select" && selectedIds.size === 1) {
      // Syncing handled natively by PropertiesPanel now
    }
    // REMOVED: else if (mode.startsWith("draw_")) loadToolStyles(mode)
    // Rationale: setMode() now handles loading styles EXPLICITLY.
    // Having it here in a reactive effect causes race conditions where
    // the effect runs "too early" or "too late" relative to selection clearing.
  });

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

    // Set up Tauri Drag & Drop Listeners
    // Use an IIFE or similar to handle async listeners in effect
    let unlisteners: (() => void)[] = [];

    if (isTauri()) {
      (async () => {
        try {
          console.log("Setting up Tauri drag-drop listeners...");
          const u1 = await listen("tauri://drag-enter", () => {
            if (
              typeof window !== "undefined" &&
              (window as any).__isLayersDragging
            ) {
              return; // Ignore internal drags from LayersPanel
            }
            isDragOver = true;
          });
          unlisteners.push(u1);

          const u2 = await listen("tauri://drag-leave", () => {
            isDragOver = false;
          });
          unlisteners.push(u2);

          const u3 = await listen("tauri://drag-drop", (event) => {
            isDragOver = false;
            const payload = event.payload as {
              paths: string[];
              position: { x: number; y: number };
            };
            if (payload.paths && payload.paths.length > 0) {
              for (const path of payload.paths) {
                addImageToCanvas(path);
              }
            }
          });
          unlisteners.push(u3);
        } catch (err) {
          console.error("Failed to setup Tauri listeners:", err);
        }
      })();
    }

    return () => {
      cancelAnimationFrame(frameId);
      unlisteners.forEach((u) => u());
    };
  });

  function centerCanvas() {
    // Determine container size (or use window size for now)
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;

    offset.x = (containerWidth - resolvedW * zoom) / 2 + RULER_SIZE;
    offset.y = (containerHeight - resolvedH * zoom) / 2 + RULER_SIZE;
  }

  function updateScaleBars() {
    for (const obj of objects) {
      if (obj.type === "scalebar" && obj.parentId) {
        const parent = objects.find((o) => o.id === obj.parentId);
        if (parent && parent.type === "image") {
          const natW = parent.naturalWidth || parent.width;
          const natH = parent.naturalHeight || parent.height;
          const scaleFactor = parent.width / natW;

          let newW = obj.width;
          let newOffsetX =
            obj.offsetX ?? natW - obj.physicalLength! / obj.pixelSize! - 10;
          let newOffsetY = obj.offsetY ?? natH - 30;

          if (obj.physicalLength && obj.pixelSize && natW > 0) {
            newW = (obj.physicalLength / obj.pixelSize) * scaleFactor;
          }

          if (obj.presetPosition && obj.presetPosition !== "custom") {
            const w = newW / scaleFactor;
            const h = 30; // Approx height for text + bar
            const margin = 15;

            if (obj.presetPosition.includes("top")) newOffsetY = margin;
            if (obj.presetPosition.includes("bottom"))
              newOffsetY = natH - h - margin;
            if (
              obj.presetPosition === "center" ||
              obj.presetPosition === "center-left" ||
              obj.presetPosition === "center-right"
            )
              newOffsetY = (natH - h) / 2;

            if (obj.presetPosition.includes("left")) newOffsetX = margin;
            if (obj.presetPosition.includes("right"))
              newOffsetX = natW - w - margin;
            if (
              obj.presetPosition === "top-center" ||
              obj.presetPosition === "bottom-center" ||
              obj.presetPosition === "center"
            )
              newOffsetX = (natW - w) / 2;
          }

          const newX = parent.x + newOffsetX * scaleFactor;
          const newY = parent.y + newOffsetY * scaleFactor;

          if (Math.abs(obj.x - newX) > 0.001) obj.x = newX;
          if (Math.abs(obj.y - newY) > 0.001) obj.y = newY;
          if (Math.abs(obj.width - newW) > 0.001) obj.width = newW;
          if (Math.abs((obj.offsetX || 0) - newOffsetX) > 0.001)
            obj.offsetX = newOffsetX;
          if (Math.abs((obj.offsetY || 0) - newOffsetY) > 0.001)
            obj.offsetY = newOffsetY;
        }
      }
    }
  }

  function render() {
    if (!ctx || !canvas) return;

    // Sync scale bars before drawing
    updateScaleBars();

    // Clear visible area
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#1e1e1e"; // Dark background
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 1. Draw Paper & Grid (World Space)
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Draw "Paper" (The actual document area)
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 20;
    ctx.fillRect(0, 0, resolvedW, resolvedH);
    ctx.shadowBlur = 0; // Reset shadow

    // Draw Grid (on top of paper)
    if (showGrid) {
      drawGrid(ctx);
    }

    // Draw Objects
    for (const obj of objects) {
      if (obj.hidden) continue;
      drawObject(ctx, obj, imageCache, globalTheme);
    }

    // Draw Pending Object (being drawn)
    if (pendingObject) {
      drawObject(ctx, pendingObject, imageCache, globalTheme);
      
      // Draw live curve preview for draw_path
      if (mode === "draw_path" && 
          pendingObject.type === "path" && 
          pendingObject.pathNodes && 
          pendingObject.pathNodes.length > 0 && 
          !isDragging) 
      {
          const lastNode = pendingObject.pathNodes[pendingObject.pathNodes.length - 1];
          const mouseW = screenToWorld(lastMousePos.x, lastMousePos.y);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(lastNode.x, lastNode.y);
          if (lastNode.cp2x !== undefined && lastNode.cp2y !== undefined) {
              ctx.bezierCurveTo(lastNode.cp2x, lastNode.cp2y, mouseW.x, mouseW.y, mouseW.x, mouseW.y);
          } else {
              ctx.lineTo(mouseW.x, mouseW.y);
          }
          ctx.strokeStyle = pendingObject.stroke || "#000";
          ctx.lineWidth = pendingObject.strokeWidth || 2;
          ctx.stroke();
          ctx.restore();
      }
    }

    // Draw Selection Overlay
    drawSelectionOverlay(ctx);

    // Draw Snap Guides
    drawGuides(ctx);

    ctx.restore();

    // 2. Draw Rulers (Screen Space / Mixed)
    drawRulers(ctx);
  }

  function drawSelectionOverlay(ctx: CanvasRenderingContext2D) {
    // Draw selection handles for selected objects
    if (selectedIds.size > 0) {
      ctx.save();
      ctx.strokeStyle = "#2196f3";
      ctx.lineWidth = 1 / zoom;

      // Handle single selection with rotation separate from multi-selection (axis aligned)
      if (selectedIds.size === 1) {
        const id = Array.from(selectedIds)[0];
        const obj = objects.find((o) => o.id === id);
        if (obj) {
          if (cropModeId === obj.id && obj.type === "image") {
            // Draw Interactive Crop UI
            const img = imageCache.get(obj.src!);
            if (img && img.complete) {
              const nw = img.naturalWidth || obj.width;
              const nh = img.naturalHeight || obj.height;
              const cl = obj.cropLeft ?? 0;
              const ct = obj.cropTop ?? 0;
              const cr = obj.cropRight ?? 0;
              const cb = obj.cropBottom ?? 0;
              const sw = nw - cl - cr;
              const sh = nh - ct - cb;

              if (sw > 0 && sh > 0) {
                const scaleX = obj.width / sw;
                const scaleY = obj.height / sh;

                const fullX = obj.x - cl * scaleX;
                const fullY = obj.y - ct * scaleY;
                const fullW = nw * scaleX;
                const fullH = nh * scaleY;

                ctx.save();
                // Draw dimmed full image underneath so user sees what is being cropped
                ctx.globalAlpha = 0.4;
                ctx.drawImage(img, fullX, fullY, fullW, fullH);
                ctx.globalAlpha = 1.0;

                // Draw dashed outline
                ctx.strokeStyle = "#2196f3";
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([5 / zoom, 5 / zoom]);
                ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
                ctx.setLineDash([]);

                // Draw solid corner/edge crop handles
                ctx.fillStyle = "#2196f3";
                const hLen = 16 / zoom;
                const hThick = 4 / zoom;
                const hMid = hThick / 2;

                // NW
                ctx.fillRect(obj.x - hMid, obj.y - hMid, hLen, hThick);
                ctx.fillRect(obj.x - hMid, obj.y - hMid, hThick, hLen);
                // NE
                ctx.fillRect(
                  obj.x + obj.width - hLen + hMid,
                  obj.y - hMid,
                  hLen,
                  hThick,
                );
                ctx.fillRect(
                  obj.x + obj.width - hMid,
                  obj.y - hMid,
                  hThick,
                  hLen,
                );
                // SW
                ctx.fillRect(
                  obj.x - hMid,
                  obj.y + obj.height - hMid,
                  hLen,
                  hThick,
                );
                ctx.fillRect(
                  obj.x - hMid,
                  obj.y + obj.height - hLen + hMid,
                  hThick,
                  hLen,
                );
                // SE
                ctx.fillRect(
                  obj.x + obj.width - hLen + hMid,
                  obj.y + obj.height - hMid,
                  hLen,
                  hThick,
                );
                ctx.fillRect(
                  obj.x + obj.width - hMid,
                  obj.y + obj.height - hLen + hMid,
                  hThick,
                  hLen,
                );

                // N, E, S, W
                ctx.fillRect(
                  obj.x + obj.width / 2 - hLen / 2,
                  obj.y - hMid,
                  hLen,
                  hThick,
                );
                ctx.fillRect(
                  obj.x + obj.width - hMid,
                  obj.y + obj.height / 2 - hLen / 2,
                  hThick,
                  hLen,
                );
                ctx.fillRect(
                  obj.x + obj.width / 2 - hLen / 2,
                  obj.y + obj.height - hMid,
                  hLen,
                  hThick,
                );
                ctx.fillRect(
                  obj.x - hMid,
                  obj.y + obj.height / 2 - hLen / 2,
                  hThick,
                  hLen,
                );

                ctx.restore();
              }
            }
          } else if (obj.type === "path" && (mode === "edit_nodes" || (mode === "draw_path" && obj.id === pendingObject?.id)) && obj.pathNodes) {
            // Draw Path Nodes and Control Arms (for edit and draw preview)
            ctx.save();
            const cx = obj.x + obj.width / 2;
            const cy = obj.y + obj.height / 2;
            ctx.translate(cx, cy);
            ctx.rotate(obj.rotation || 0);
            ctx.translate(-cx, -cy);

            const handleSize = 6 / zoom;
            
            obj.pathNodes.forEach((node) => {
                ctx.strokeStyle = "#888";
                ctx.lineWidth = 1 / zoom;
                
                if (node.cp1x !== undefined && node.cp1y !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node.cp1x, node.cp1y);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.arc(node.cp1x, node.cp1y, handleSize / 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = "#fff";
                    ctx.strokeStyle = "#2196f3";
                    ctx.fill();
                    ctx.stroke();
                }
                
                if (node.cp2x !== undefined && node.cp2y !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(node.cp2x, node.cp2y);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.arc(node.cp2x, node.cp2y, handleSize / 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = "#fff";
                    ctx.strokeStyle = "#2196f3";
                    ctx.fill();
                    ctx.stroke();
                }
                
                ctx.fillStyle = node.id === selectedNodeId ? "#2196f3" : "#fff";
                ctx.strokeStyle = "#2196f3";
                ctx.fillRect(node.x - handleSize/2, node.y - handleSize/2, handleSize, handleSize);
                ctx.strokeRect(node.x - handleSize/2, node.y - handleSize/2, handleSize, handleSize);
            });
            ctx.restore();
          } else if (obj.type === "arc" && mode === "edit_nodes") {
            // Draw arc angle handles: start and end
            const ecx = obj.x + obj.width / 2;
            const ecy = obj.y + obj.height / 2;
            const rx = Math.abs(obj.width / 2);
            const ry = Math.abs(obj.height / 2);
            const sa = obj.startAngle ?? 0;
            const ea = obj.endAngle ?? Math.PI * 2;
            const handleSize = 8 / zoom;

            ctx.save();
            ctx.translate(ecx, ecy);
            ctx.rotate(obj.rotation || 0);
            ctx.translate(-ecx, -ecy);
            
            ctx.lineWidth = 1 / zoom;

            // Guide lines from center to each handle
            ctx.strokeStyle = "#888";
            ctx.setLineDash([4/zoom, 4/zoom]);
            ctx.beginPath();
            ctx.moveTo(ecx, ecy);
            ctx.lineTo(ecx + rx * Math.cos(sa), ecy + ry * Math.sin(sa));
            ctx.moveTo(ecx, ecy);
            ctx.lineTo(ecx + rx * Math.cos(ea), ecy + ry * Math.sin(ea));
            ctx.stroke();
            ctx.setLineDash([]);

            // Start angle handle (green)
            const sx = ecx + rx * Math.cos(sa);
            const sy = ecy + ry * Math.sin(sa);
            ctx.beginPath();
            ctx.arc(sx, sy, handleSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = "#4caf50";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.stroke();

            // End angle handle (red)
            const ex = ecx + rx * Math.cos(ea);
            const ey = ecy + ry * Math.sin(ea);
            ctx.beginPath();
            ctx.arc(ex, ey, handleSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = "#f44336";
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.stroke();

            ctx.restore();
          } else if ((obj.type === "ellipse" || obj.type === "rectangle") && mode === "edit_nodes") {
            // Hint: click to convert to path
            const ecx = obj.x + obj.width / 2;
            const ecy = obj.y + obj.height / 2;
            ctx.save();
            ctx.translate(ecx, ecy);
            ctx.rotate(obj.rotation || 0);
            ctx.translate(-ecx, -ecy);
            
            ctx.font = `${12/zoom}px sans-serif`;
            ctx.fillStyle = "#2196f3";
            ctx.textAlign = "center";
            ctx.fillText("Click to convert to path", ecx, obj.y - 10/zoom);
            ctx.restore();
          } else {
            // Standard Single Selection Overlay (Resize/Rotate)
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
            } else if (obj.type === "path" && obj.pathNodes && obj.pathNodes.length > 0) {
              bx = Math.min(...obj.pathNodes.map(n => n.x));
              by = Math.min(...obj.pathNodes.map(n => n.y));
              bw = Math.max(...obj.pathNodes.map(n => n.x)) - bx;
              bh = Math.max(...obj.pathNodes.map(n => n.y)) - by;
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
    } // Close selectedIds.size > 0 block

    // Marquee Selection
    if (selectionRect) {
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
    }
  }

  function drawGuides(ctx: CanvasRenderingContext2D) {
    if (activeGuides.length === 0) return;

    ctx.save();
    ctx.strokeStyle = "#ff00ff"; // Magenta for visibility
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]); // Dashed line

    for (const guide of activeGuides) {
      ctx.beginPath();
      if (guide.type === "vertical") {
        ctx.moveTo(guide.offset, guide.start);
        ctx.lineTo(guide.offset, guide.end);
      } else {
        ctx.moveTo(guide.start, guide.offset);
        ctx.lineTo(guide.end, guide.offset);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGrid(context: CanvasRenderingContext2D) {
    context.strokeStyle = "#e0e0e0";
    context.lineWidth = 1 / zoom; // Keep grid lines thin

    context.beginPath();
    // Vertical lines
    for (let x = 0; x <= resolvedW; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, resolvedH);
    }
    // Horizontal lines
    for (let y = 0; y <= resolvedH; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(resolvedW, y);
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

  function reorderObjects(fromIndex: number, toIndex: number) {
    console.log("reorderObjects called:", fromIndex, "->", toIndex);
    if (
      fromIndex < 0 ||
      fromIndex >= objects.length ||
      toIndex < 0 ||
      toIndex >= objects.length
    )
      return;
    const item = objects.splice(fromIndex, 1)[0];
    objects.splice(toIndex, 0, item);
    objects = [...objects]; // trigger reactivity
    console.log(
      "objects after reorder:",
      objects.map((o) => o.id),
    );
    saveHistory();
  }

  function toggleSelection(id: string, shiftKey: boolean) {
    if (shiftKey) {
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
    } else {
      if (!selectedIds.has(id)) {
        selectedIds.clear();
        selectedIds.add(id);
      }
    }
    selectedIds = new Set(selectedIds);
  }

  // (alignSelected removed — alignment handled by alignLeft/Right/etc. from Issue #18)

  // ── Z-Order functions ───────────────────────────────────────────────────
  function bringToFront() {
    if (selectedIds.size === 0) return;
    saveHistory();
    const sel = objects.filter((o) => selectedIds.has(o.id));
    const rest = objects.filter((o) => !selectedIds.has(o.id));
    objects = [...rest, ...sel];
  }

  function sendToBack() {
    if (selectedIds.size === 0) return;
    saveHistory();
    const sel = objects.filter((o) => selectedIds.has(o.id));
    const rest = objects.filter((o) => !selectedIds.has(o.id));
    objects = [...sel, ...rest];
  }

  function bringForward() {
    if (selectedIds.size === 0) return;
    saveHistory();
    const arr = [...objects];
    // Iterate from end to avoid double-moving
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selectedIds.has(arr[i].id) && !selectedIds.has(arr[i + 1].id)) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
    objects = arr;
  }

  function sendBackward() {
    if (selectedIds.size === 0) return;
    saveHistory();
    const arr = [...objects];
    // Iterate from start to avoid double-moving
    for (let i = 1; i < arr.length; i++) {
      if (selectedIds.has(arr[i].id) && !selectedIds.has(arr[i - 1].id)) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
    objects = arr;
  }

  function applyLayoutTemplate(
    rows: number,
    cols: number,
    options: { spacing?: number; margin?: number } = {},
  ) {
    const spacing = options.spacing ?? 20;
    const margin = options.margin ?? 40;

    // Calculate available space
    const availableWidth = width - 2 * margin - (cols - 1) * spacing;
    const availableHeight = height - 2 * margin - (rows - 1) * spacing;

    // Calculate panel dimensions
    const panelWidth = availableWidth / cols;
    const panelHeight = availableHeight / rows;

    // Create panels
    const newPanels: CanvasObject[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const panel: CanvasObject = {
          id: crypto.randomUUID(),
          type: "rectangle",
          x: margin + col * (panelWidth + spacing),
          y: margin + row * (panelHeight + spacing),
          width: panelWidth,
          height: panelHeight,
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 2,
        };
        newPanels.push(panel);
      }
    }

    // Add panels to canvas
    objects.push(...newPanels);

    // Select all new panels
    selectedIds.clear();
    newPanels.forEach((panel) => selectedIds.add(panel.id));
    selectedIds = new Set(selectedIds);

    saveHistory();
  }

  function applyFontToSelected(
    property: "fontFamily" | "fontSize" | "fontWeight" | "fontStyle",
    value: string | number,
  ) {
    const selectedObjects = objects.filter(
      (obj) => selectedIds.has(obj.id) && (obj.type === "text" || obj.type === "label"),
    );

    if (selectedObjects.length === 0) return;

    for (const obj of selectedObjects) {
      if (property === "fontSize" && typeof value === "number") {
        obj.fontSize = value;
      } else if (typeof value === "string") {
        if (property === "fontFamily") obj.fontFamily = value;
        else if (property === "fontWeight")
          obj.fontWeight = value as "normal" | "bold";
        else if (property === "fontStyle")
          obj.fontStyle = value as "normal" | "italic";
      }
    }

    saveHistory();
  }

  function onScaleBarConfirm(
    physicalLength: number,
    pixelSize: number,
    units: string,
  ) {
    if (!scaleBarTargetImage) return;

    const pw = physicalLength / pixelSize;
    const newScaleBar: CanvasObject = {
      id: crypto.randomUUID(),
      type: "scalebar",
      x: scaleBarTargetImage.x + scaleBarTargetImage.width - pw - 10,
      y: scaleBarTargetImage.y + scaleBarTargetImage.height - 20,
      width: pw,
      height: 10,
      physicalLength,
      pixelSize,
      units,
      labelPosition: "below",
      backgroundColor: "transparent",
      backgroundOpacity: 1.0,
      presetPosition: "bottom-right",
      parentId: scaleBarTargetImage.id,
      offsetX: scaleBarTargetImage.width - pw - 10,
      offsetY: scaleBarTargetImage.height - 20,
      fill: undefined,
      stroke: undefined,
      strokeWidth: undefined,
      fontFamily: undefined,
      fontSize: undefined,
    };

    objects.push(newScaleBar);
    selectedIds.clear();
    selectedIds.add(newScaleBar.id);
    saveHistory();

    isScaleBarPromptOpen = false;
    scaleBarTargetImage = null;
    mode = "select";
  }

  function onScaleBarCancel() {
    isScaleBarPromptOpen = false;
    scaleBarTargetImage = null;
    mode = "select";
  }

  async function importImage() {
    try {
      if (isTauri()) {
        const selected = await open({
          multiple: true,
          filters: [
            {
              name: "Supported Files",
              extensions: [
                "png",
                "jpg",
                "jpeg",
                "webp",
                "gif",
                "bmp",
                "tiff",
                "tif",
                "svg",
                "pdf",
              ],
            },
            {
              name: "Vectors & PDFs",
              extensions: ["svg", "pdf"],
            },
          ],
        });

        if (selected === null) return;
        const paths = Array.isArray(selected) ? selected : [selected];
        console.log("Selected paths:", paths);

        for (const path of paths) {
          await addImageToCanvas(path);
        }
      } else {
        // Browser fallback
        imageInput.click();
      }
    } catch (err) {
      console.error("Failed to open image:", err);
    }
  }

  async function handleBrowserFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      let objectUrl = "";

      try {
        if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          const buffer = await file.arrayBuffer();
          objectUrl = await renderPdfPageToDataUrl(buffer);
        } else if (
          file.type === "image/svg+xml" ||
          file.name.toLowerCase().endsWith(".svg")
        ) {
          const text = await file.text();
          
          const match = text.match(/data-scifigura="([^"]+)"/);
          if (match) {
            importSciFiguraObjects(match[1]);
            input.value = "";
            return;
          }
          
          objectUrl = await renderSvgToDataUrl(text);
        } else if (file.type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(file);
        } else {
          console.log("Skipping non-image/pdf file:", file.name, file.type);
          input.value = "";
          return;
        }
      } catch (err) {
        console.error("Failed to process fallback input file:", err);
        input.value = "";
        return;
      }

      const img = new Image();
      img.src = objectUrl;
      await new Promise((r) => (img.onload = r));

      const newImage: CanvasObject = {
        id: crypto.randomUUID(),
        type: "image",
        x: (lastMousePos.x - offset.x) / zoom,
        y: (lastMousePos.y - offset.y) / zoom,
        width: img.naturalWidth,
        height: img.naturalHeight,
        src: objectUrl,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        rotation: 0,
        fill: "transparent",
      };

      objects.push(newImage);
      selectedIds.clear();
      selectedIds.add(newImage.id);
      selectedIds = new Set(selectedIds);
      saveHistory();
      hasStarted = true;

      // Reset input
      input.value = "";
    }
  }

  function importSciFiguraObjects(escapedJson: string) {
    try {
      const jsonStr = escapedJson.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const importedObjects: CanvasObject[] = JSON.parse(jsonStr);
      
      if (!Array.isArray(importedObjects)) return;

      let minX = Infinity;
      let minY = Infinity;
      importedObjects.forEach(o => {
          minX = Math.min(minX, o.x);
          minY = Math.min(minY, o.y);
      });
      
      const targetX = (lastMousePos.x - offset.x) / zoom;
      const targetY = (lastMousePos.y - offset.y) / zoom;
      const dx = isFinite(minX) ? targetX - minX : 0;
      const dy = isFinite(minY) ? targetY - minY : 0;

      const newIds = new Set<string>();
      const idMap = new Map<string, string>();
      
      importedObjects.forEach(o => {
          const newId = crypto.randomUUID();
          idMap.set(o.id, newId);
          o.id = newId;
          o.x += dx;
          o.y += dy;
          if (o.x2 !== undefined) o.x2 += dx;
          if (o.y2 !== undefined) o.y2 += dy;
          newIds.add(newId);
          objects.push(o);
      });
      
      importedObjects.forEach(o => {
          if (o.parentId && idMap.has(o.parentId)) {
              o.parentId = idMap.get(o.parentId);
          }
      });

      selectedIds = newIds;
      saveHistory();
      hasStarted = true;
    } catch (e) {
      console.error("Failed to parse embedded SciFigura objects:", e);
    }
  }

  async function addImageToCanvas(path: string) {
    console.log("Adding image from path:", path);
    let assetUrl = path;
    const img = new Image();

    try {
      if (isTauri() && !path.startsWith("blob:")) {
        console.log("Reading file bytes to avoid WKWebView tainted canvas...");
        const bytes = await readFile(path);
        const lcPath = path.toLowerCase();

        if (lcPath.endsWith(".pdf")) {
          assetUrl = await renderPdfPageToDataUrl(bytes.buffer);
        } else if (lcPath.endsWith(".svg")) {
          const text = new TextDecoder().decode(bytes);
          
          const match = text.match(/data-scifigura="([^"]+)"/);
          if (match) {
            importSciFiguraObjects(match[1]);
            return;
          }
          
          assetUrl = await renderSvgToDataUrl(text);
        } else {
          const blob = new Blob([bytes]);
          assetUrl = URL.createObjectURL(blob);
        }
      }

      img.src = assetUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
    } catch (e: any) {
      console.warn("Failed to load image:", e);
      return;
    }

    const newImage: CanvasObject = {
      id: crypto.randomUUID(),
      type: "image",
      x: (lastMousePos.x - offset.x) / zoom,
      y: (lastMousePos.y - offset.y) / zoom,
      width: img.naturalWidth,
      height: img.naturalHeight,
      src: assetUrl,
      originalPath: path, // Save the path for restoring SFS projects later
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      rotation: 0,
      fill: "transparent",
    };

    // Center on screen if mouse is far off?
    // For now, use lastMousePos which tracks mouse movement

    // Better: Place at center of view if mouse is not in canvas?
    // Let's stick to simple logic for now.

    objects.push(newImage);
    selectedIds.clear();
    selectedIds.add(newImage.id);
    selectedIds = new Set(selectedIds);
    saveHistory();
  }

  // Drag and Drop Handlers
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    console.log("onDrop event:", e);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      console.log("Dropped files:", files);

      for (const file of files) {
        let objectUrl = "";

        try {
          if (
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
          ) {
            const buffer = await file.arrayBuffer();
            objectUrl = await renderPdfPageToDataUrl(buffer);
          } else if (
            file.type === "image/svg+xml" ||
            file.name.toLowerCase().endsWith(".svg")
          ) {
            const text = await file.text();
            objectUrl = await renderSvgToDataUrl(text);
          } else if (file.type.startsWith("image/")) {
            objectUrl = URL.createObjectURL(file);
          } else {
            console.log("Skipping non-image/pdf file:", file.name, file.type);
            continue;
          }

          console.log("Created Object URL for drop:", objectUrl);

          const img = new Image();
          img.src = objectUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (err) => reject(err);
          });

          const newImage: CanvasObject = {
            id: crypto.randomUUID(),
            type: "image",
            x: (e.clientX - rect.left - offset.x) / zoom,
            y: (e.clientY - rect.top - offset.y) / zoom,
            width: img.naturalWidth,
            height: img.naturalHeight,
            src: objectUrl,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            rotation: 0,
            fill: "transparent",
          };

          objects.push(newImage);
          console.log("Added dropped image to canvas:", newImage.id);
        } catch (err) {
          console.error("Failed to process dropped file:", file.name, err);
        }
      }
      saveHistory();
      // Force reactivity if needed, though push to proxy array should trigger it
    } else {
      console.log("No files in dataTransfer");
    }
    isDragOver = false;
  }

  // We need `rect` for drop position calculation
  let rect = { left: 0, top: 0 };
  function updateRect() {
    if (canvas) rect = canvas.getBoundingClientRect();
  }

  // Helper Functions
  function worldToScreen(x: number, y: number) {
    return {
      x: x * zoom + offset.x,
      y: y * zoom + offset.y,
    };
  }

  function applyStyleToSelected(
    property: "fill" | "stroke" | "strokeWidth" | "lineDash",
    value: string | number | number[],
  ) {
    console.log(
      "applyStyleToSelected called:",
      property,
      value,
      "Switching:",
      isSwitchingTool,
      "Selected:",
      selectedIds.size,
    );
    if (isSwitchingTool || mode.startsWith("draw_")) {
      console.warn(
        "BLOCKED applyStyleToSelected: Drawing tool active or switching.",
      );
      return;
    }

    const selectedObjects = objects.filter((obj) => selectedIds.has(obj.id));

    if (selectedObjects.length === 0) {
      console.log("No objects selected, ignoring style apply.");
      return;
    }

    for (const obj of selectedObjects) {
      if (property === "fill" && typeof value === "string") {
        obj.fill = value;
      } else if (property === "stroke" && typeof value === "string") {
        obj.stroke = value;
      } else if (property === "strokeWidth" && typeof value === "number") {
        obj.strokeWidth = value;
      } else if (property === "lineDash" && Array.isArray(value)) {
        obj.lineDash = value;
      }
    }

    saveHistory();
  }

  function updateObjectProperty(
    id: string,
    props: Partial<CanvasObject>,
    save: boolean = true,
  ) {
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;

    Object.assign(obj, props);
    // Determine bounds if geometry changed?
    // Usually simple assignment is enough for Svelte $state

    if (save) {
      saveHistory();
    }
  }

  function selectSimilar() {
    if (selectedIds.size !== 1) return;
    const id = Array.from(selectedIds)[0];
    const sourceObj = objects.find((o) => o.id === id);
    if (!sourceObj) return;

    const newSelection = new Set(selectedIds);

    objects.forEach((obj) => {
      if (obj.id === sourceObj.id) return;

      if (isSimilar(sourceObj, obj)) {
        newSelection.add(obj.id);
      }
    });

    selectedIds = newSelection;
  }

  function isSimilar(a: CanvasObject, b: CanvasObject): boolean {
    if (a.type !== b.type) return false;

    if (a.type === "text") {
      return (
        a.fontFamily === b.fontFamily &&
        a.fontSize === b.fontSize &&
        a.fontWeight === b.fontWeight &&
        a.fontStyle === b.fontStyle &&
        a.fill === b.fill
      );
    }

    // Shapes & Lines
    // Compare arrays for lineDash
    const dashA = a.lineDash || [];
    const dashB = b.lineDash || [];
    const dashMatch =
      dashA.length === dashB.length && dashA.every((v, i) => v === dashB[i]);

    return (
      a.fill === b.fill &&
      a.stroke === b.stroke &&
      a.strokeWidth === b.strokeWidth &&
      dashMatch
    );
  }

  // Helper to get handle under mouse
  function getHandleAtPosition(worldX: number, worldY: number): string | null {
    if (selectedIds.size !== 1) return null; // Only single select for now

    const id = Array.from(selectedIds)[0];
    const obj = objects.find((o) => o.id === id);
    if (!obj) return null;

    let handleSize = 8 / zoom;
    if (cropModeId === obj.id) handleSize = 16 / zoom; // Larger hit area for crop
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
    // Returns hit ID or null.
    const checkHit = (
      obj: CanvasObject,
      insideActive: boolean,
    ): string | null => {
      if (obj.hidden || obj.locked) return null;

      const isActive = insideActive || obj.id === activeGroupId;

      if (obj.type === "group" && obj.children) {
        // Check children in reverse order (top-most first)
        for (let i = obj.children.length - 1; i >= 0; i--) {
          if (obj.children[i].hidden || obj.children[i].locked) continue;
          const hitId = checkHit(obj.children[i], isActive);
          if (hitId) {
            // If actively editing this group, return the child ID directly
            if (isActive) return hitId;
            // Otherwise, normal grouping behavior: return the group ID
            return obj.id;
          }
        }
        return null;
      }

      let isHit = false;
      if (obj.type === "line" && obj.x2 !== undefined && obj.y2 !== undefined) {
        // Line Hit Test
        const A = { x: obj.x, y: obj.y };
        const B = { x: obj.x2, y: obj.y2 };
        const P = { x, y };

        const l2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
        if (l2 !== 0) {
          let t = ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / l2;
          t = Math.max(0, Math.min(1, t));

          const proj = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
          const dist = Math.sqrt((P.x - proj.x) ** 2 + (P.y - proj.y) ** 2);
          isHit = dist <= HIT_TOLERANCE;
        }
      } else if (obj.type === "path" && obj.pathNodes && obj.pathNodes.length > 0) {
        // Bounding box hit test based on path nodes and control arms
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of obj.pathNodes) {
          minX = Math.min(minX, node.x, node.cp1x ?? node.x, node.cp2x ?? node.x);
          minY = Math.min(minY, node.y, node.cp1y ?? node.y, node.cp2y ?? node.y);
          maxX = Math.max(maxX, node.x, node.cp1x ?? node.x, node.cp2x ?? node.x);
          maxY = Math.max(maxY, node.y, node.cp1y ?? node.y, node.cp2y ?? node.y);
        }
        const padding = 10 / zoom; // Generous hit area for thin lines
        isHit = x >= minX - padding && x <= maxX + padding && y >= minY - padding && y <= maxY + padding;
      } else {
        // Shape Hit Test
        isHit =
          x >= obj.x &&
          x <= obj.x + obj.width &&
          y >= obj.y &&
          y <= obj.y + obj.height;
      }

      return isHit ? obj.id : null;
    };

    // Iterate in reverse to hit top-most object first
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].hidden || objects[i].locked) continue;
      const hitId = checkHit(objects[i], false);
      if (hitId) {
        return hitId;
      }
    }
    return null;
  }

  // --- Interaction Handlers ---

  // Canvas Sizing
  let canvasWidth = $state(800);
  let canvasHeight = $state(600);

  function screenToWorld(cx: number, cy: number) {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = cx - rect.left;
    const y = cy - rect.top;

    return {
      x: (x - offset.x) / zoom,
      y: (y - offset.y) / zoom,
    };
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();

    // Get mouse pos relative to canvas
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Zoom
    if (event.ctrlKey) {
      // Adjust sensitivity for trackpad vs mouse
      // Chrome/Safari on Mac trackpad pinch creates ctrl+wheel events
      // The deltaY is usually small for pinch.

      // Standardize delta
      let delta = -event.deltaY;

      // If the delta is small (trackpad), boost it?
      // No, standard zoom_sensitivity might just be too low for pixel-based deltas.
      // Let's create a dynamic sensitivity.

      // For trackpads, deltaY is often just 1 or 2 per event but fires rapidly.
      // For mouse wheels, it's 100+.

      // If we are pinching, we want a smooth zoom.
      // Let's increase the base sensitivity.
      const factor = 0.01; // Increased from 0.001 (10x sensitivity)

      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, zoom + delta * factor),
      );

      // Zoom towards mouse pointer
      // 1. World before zoom
      const wx = (mouseX - offset.x) / zoom;
      const wy = (mouseY - offset.y) / zoom;

      zoom = newZoom;

      // 2. Adjust offset to keep World point at same Screen point
      // screenX = wx * newZoom + newOffset
      // newOffset = screenX - wx * newZoom
      offset.x = mouseX - wx * zoom;
      offset.y = mouseY - wy * zoom;

      event.preventDefault();
    } else {
      // Pan
      offset.x -= event.deltaX;
      offset.y -= event.deltaY;
    }
  }

  function handleMouseDown(event: MouseEvent) {
    const worldPos = screenToWorld(event.clientX, event.clientY);

    // 1. Pan (Middle click, Space+Left, or Pan tool active)
    if (
      event.button === 1 ||
      (event.button === 0 && (isSpacePressed || isPanToolActive))
    ) {
      mode = "pan";
      isDragging = true;
      dragStart = { x: event.clientX, y: event.clientY };
      return;
    }

    // 2. Select / Move (Left click, no pan active)
    if (event.button === 0 && !isSpacePressed && !isPanToolActive) {
      if (mode === "draw_scalebar") {
        const hitId = hitTest(worldPos.x, worldPos.y);
        if (hitId) {
          const targetObj = objects.find((o) => o.id === hitId);
          if (targetObj && targetObj.type === "image") {
            scaleBarTargetImage = targetObj;
            isScaleBarPromptOpen = true;
          }
        }
        return;
      }

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

      if (mode === "draw_label") {
        const labelText = getLabelText(nextLabelIndex);

        const tStyle = toolStyles["draw_label"] || {};
        // Labels should inherit from globalTheme for font, but use explicit black for fill
        const labelFill = tStyle.fill || undefined; // inherit from theme (theme.strokeColor used for text)
        const labelFontSize = tStyle.fontSize || undefined;
        const labelFontWeight = tStyle.fontWeight || "bold";
        const labelFontFamily = tStyle.fontFamily || undefined;
        const labelFontStyle = tStyle.fontStyle || "normal";

        const newLabel: CanvasObject = {
          id: crypto.randomUUID(),
          type: "label",
          x: worldPos.x,
          y: worldPos.y,
          width: 20, // Approx
          height: 20,
          text: labelText,
          fontSize: labelFontSize,
          fontWeight: labelFontWeight,
          fontFamily: labelFontFamily,
          fontStyle: labelFontStyle,
          fill: labelFill,
          // Custom label props
          autoIncrement: true,
          labelStyle: "uppercase",
          parentheses: "none",
        };

        nextLabelIndex++;
        if (objects.some((o) => o.id === newLabel.id)) {
          console.error("CRITICAL: DUPLICATE ID GENERATED", newLabel.id);
          newLabel.id = crypto.randomUUID(); // Retry
        }
        objects.push(newLabel);
        selectedIds.clear();
        selectedIds.add(newLabel.id);
        selectedIds = new Set(selectedIds);
        saveHistory();
        return;
      }

      if (mode === "draw_path") {
        if (!pendingObject) {
          pendingObject = {
            id: crypto.randomUUID(),
            type: "path",
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            pathNodes: [
              { id: crypto.randomUUID(), x: worldPos.x, y: worldPos.y, cp1x: undefined, cp1y: undefined, cp2x: undefined, cp2y: undefined, type: "smooth" },
            ],
            fill: undefined,
            stroke: undefined,
            strokeWidth: undefined,
            closed: false,
          };
        } else if (pendingObject.pathNodes) {
          // Check if clicking near first node to close
          const first = pendingObject.pathNodes[0];
          const dist = Math.hypot(worldPos.x - first.x, worldPos.y - first.y);
          if (dist < 10 / zoom && pendingObject.pathNodes.length > 2) {
            pendingObject.closed = true;
            objects = [...objects, pendingObject];
            selectedIds = new Set([pendingObject.id]);
            pendingObject = null;
            saveHistory();
            mode = "select";
            return;
          } else {
            pendingObject.pathNodes.push({
              id: crypto.randomUUID(),
              x: worldPos.x,
              y: worldPos.y,
              cp1x: undefined,
              cp1y: undefined,
              cp2x: undefined,
              cp2y: undefined,
              type: "smooth",
            });
          }
        }
        
        isDragging = true;
        // The handle being dragged is the cp2 of the newly added node
        activeHandle = "cp2";
        return;
      }

      if (
        mode === "draw_rectangle" ||
        mode === "draw_ellipse" ||
        mode === "draw_arc" ||
        mode === "draw_line"
      ) {
        // Start drawing
        isDragging = true;
        dragStart = { x: worldPos.x, y: worldPos.y };

        const toolStyle = toolStyles[mode] || {};

        pendingObject = {
          id: crypto.randomUUID(),
          type:
            mode === "draw_rectangle"
              ? "rectangle"
              : mode === "draw_ellipse"
                ? "ellipse"
                : mode === "draw_arc"
                  ? "arc"
                  : "line",
          x: worldPos.x,
          y: worldPos.y,
          // For Rect/Ellipse/Arc
          width: 0,
          height: 0,
          // For Arc
          startAngle: 0,
          endAngle: Math.PI * 1.5, // Default: 3/4 circle so it looks like a pie
          arcClosed: "pie",
          // For Line
          x2: worldPos.x,
          y2: worldPos.y,
          arrowEnd: mode === "draw_line", // Auto-add arrow to end for now

          fill: toolStyle.fill || undefined,
          stroke: toolStyle.stroke || undefined,
          strokeWidth: toolStyle.strokeWidth || undefined,
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
        mode === "rotate" ||
        mode === "edit_nodes"
      ) {
        if (mode === "edit_nodes") {
           // 1. Hit test for path nodes/handles
           let hitNode = null;
           let hitHandleType = null;
           for (const objId of selectedIds) {
               const obj = objects.find(o => o.id === objId);
               if (obj?.type === "path" && obj.pathNodes) {
                   const cx = obj.x + obj.width / 2;
                   const cy = obj.y + obj.height / 2;
                   const cos = Math.cos(-(obj.rotation || 0));
                   const sin = Math.sin(-(obj.rotation || 0));
                   const dx = worldPos.x - cx;
                   const dy = worldPos.y - cy;
                   const lp = {
                     x: cx + dx * cos - dy * sin,
                     y: cy + dx * sin + dy * cos
                   };

                   // Search backwards to hit top-most
                   for (let i = obj.pathNodes.length - 1; i >= 0; i--) {
                       const node = obj.pathNodes[i];
                       if (Math.hypot(lp.x - node.x, lp.y - node.y) < 10 / zoom) {
                           hitNode = node; hitHandleType = "anchor"; break;
                       }
                       if (node.cp1x !== undefined && node.cp1y !== undefined && Math.hypot(lp.x - node.cp1x, lp.y - node.cp1y) < 10 / zoom) {
                           hitNode = node; hitHandleType = "cp1"; break;
                       }
                       if (node.cp2x !== undefined && node.cp2y !== undefined && Math.hypot(lp.x - node.cp2x, lp.y - node.cp2y) < 10 / zoom) {
                           hitNode = node; hitHandleType = "cp2"; break;
                       }
                   }
               }
               if (hitNode) break;
           }
           
           if (hitNode) {
               if (hitHandleType === "anchor") selectedNodeId = hitNode.id;
               if (event.altKey) {
                   if (hitHandleType === "anchor") {
                       if (hitNode.cp1x !== undefined || hitNode.cp2x !== undefined) {
                           hitNode.cp1x = undefined; hitNode.cp2x = undefined;
                           hitNode.cp1y = undefined; hitNode.cp2y = undefined;
                           hitNode.type = "corner";
                       } else {
                           hitNode.type = "smooth";
                           hitNode.cp1x = hitNode.x; hitNode.cp1y = hitNode.y;
                           hitNode.cp2x = hitNode.x; hitNode.cp2y = hitNode.y;
                           hitHandleType = "cp2";
                       }
                   } else {
                       hitNode.type = "corner";
                   }
               }
               activeHandle = `node_${hitNode.id}_${hitHandleType}`;
               isDragging = true;
               dragStart = { x: worldPos.x, y: worldPos.y };
               return;
           } else {
               // 2. Missed path nodes — check for arc handles or shape conversion or path segments
               for (const objId of selectedIds) {
                   const obj = objects.find(o => o.id === objId);
                   if (!obj) continue;

                   // Arc: Hit test start/end handles
                   if (obj.type === "arc") {
                       const ecx = obj.x + obj.width / 2;
                       const ecy = obj.y + obj.height / 2;
                       const rx = Math.abs(obj.width / 2);
                       const ry = Math.abs(obj.height / 2);
                       const cos = Math.cos(-(obj.rotation || 0));
                       const sin = Math.sin(-(obj.rotation || 0));
                       const dx = worldPos.x - ecx;
                       const dy = worldPos.y - ecy;
                       const lp = { x: ecx + dx * cos - dy * sin, y: ecy + dx * sin + dy * cos };

                       const sa = obj.startAngle ?? 0;
                       const ea = obj.endAngle ?? Math.PI * 2;
                       const threshold = 12 / zoom;
                       
                       if (Math.hypot(lp.x - (ecx + rx * Math.cos(sa)), lp.y - (ecy + ry * Math.sin(sa))) < threshold) {
                           activeHandle = `arc_${obj.id}_start`;
                           isDragging = true;
                           dragStart = { x: worldPos.x, y: worldPos.y };
                           return;
                       }
                       if (Math.hypot(lp.x - (ecx + rx * Math.cos(ea)), lp.y - (ecy + ry * Math.sin(ea))) < threshold) {
                           activeHandle = `arc_${obj.id}_end`;
                           isDragging = true;
                           dragStart = { x: worldPos.x, y: worldPos.y };
                           return;
                       }
                   }

                   // Shape: Convert to path (only if click is over the shape)
                   // We use simple bounding box check for now as it's common for conversion hints
                   if (obj.type === "ellipse" || obj.type === "rectangle") {
                       const cx = obj.x + obj.width / 2;
                       const cy = obj.y + obj.height / 2;
                       const cos = Math.cos(-(obj.rotation || 0));
                       const sin = Math.sin(-(obj.rotation || 0));
                       const dx = worldPos.x - cx;
                       const dy = worldPos.y - cy;
                       const lx = dx * cos - dy * sin;
                       const ly = dx * sin + dy * cos;
                       
                       if (Math.abs(lx) < obj.width / 2 && Math.abs(ly) < obj.height / 2) {
                           saveHistory();
                           const path = convertToPath(obj);
                           const idx = objects.findIndex(o => o.id === obj.id);
                           if (idx !== -1) objects[idx] = path;
                           selectedIds = new Set(selectedIds);
                           return;
                       }
                   }

                   // Path: Add node to segment
                   if (obj.type === "path" && obj.pathNodes) {
                       const pcx = obj.x + obj.width / 2;
                       const pcy = obj.y + obj.height / 2;
                       const pcos = Math.cos(-(obj.rotation || 0));
                       const psin = Math.sin(-(obj.rotation || 0));
                       const pdx = worldPos.x - pcx;
                       const pdy = worldPos.y - pcy;
                       const plp = { x: pcx + pdx * pcos - pdy * psin, y: pcy + pdx * psin + pdy * pcos };
                       const hit = getClosestPointOnPath(obj.pathNodes, !!obj.closed, plp.x, plp.y);
                       if (hit && hit.dist < 10 / zoom) {
                           saveHistory();
                           const prevIndex = hit.segmentIndex;
                           const currIndex = (hit.segmentIndex + 1) % obj.pathNodes.length;
                           const { prev: newPrev, newNode, curr: newCurr } = splitBezierSegment(obj.pathNodes[prevIndex], obj.pathNodes[currIndex], hit.t);
                           const newId = crypto.randomUUID();
                           const fullNewNode = { ...newNode, id: newId };
                           
                           obj.pathNodes[prevIndex] = newPrev;
                           if (currIndex !== 0) {
                               obj.pathNodes[currIndex] = newCurr;
                               obj.pathNodes.splice(currIndex, 0, fullNewNode as any);
                           } else {
                               obj.pathNodes[0] = newCurr;
                               obj.pathNodes.push(fullNewNode as any);
                           }
                           selectedNodeId = newId;
                           return;
                       }
                   }
               }
            }
        }

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

        if (cropModeId && hitId !== cropModeId) {
          cropModeId = null;
        }

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

          // Snapshot selection for move
          selectionSnapshot.clear();
          for (const id of selectedIds) {
            const obj = objects.find((o) => o.id === id);
            if (obj) {
              selectionSnapshot.set(id, {
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                x2: obj.type === "line" ? obj.x2 : undefined,
                y2: obj.type === "line" ? obj.y2 : undefined,
                pathNodes: obj.type === "path" && obj.pathNodes ? JSON.parse(JSON.stringify(obj.pathNodes)) : undefined
              });
            }
          }
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
    // Ignore shortcuts when typing in inputs/textareas
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;
    const key = event.key;
    const code = event.code;

    // ── Space (pan) ──────────────────────────────────────────────────────────
    if (code === "Space") {
      isSpacePressed = true;
    }

    // ── ? shortcut (requires Shift on most keyboards — check before !shift gate)
    if (!ctrl && !event.altKey && !textInput.visible && key === "?") {
      showShortcutsHelp = !showShortcutsHelp;
      event.preventDefault();
      return;
    }

    // ── Tool selection (no ctrl, no alt, no shift) ────────────────────────────
    if (!ctrl && !shift && !event.altKey && !textInput.visible) {
      switch (key) {
        case "v":
        case "V":
          isSpacePressed = false;
          isPanToolActive = false;
          mode = "select";
          event.preventDefault();
          return;
        case "r":
        case "R":
          isPanToolActive = false;
          mode = "draw_rectangle";
          event.preventDefault();
          return;
        case "e":
        case "E":
          isPanToolActive = false;
          mode = "draw_ellipse";
          event.preventDefault();
          return;
        case "w":
        case "W":
          isPanToolActive = false;
          mode = "draw_arc";
          event.preventDefault();
          return;
        case "l":
        case "L":
          isPanToolActive = false;
          mode = "draw_line";
          event.preventDefault();
          return;
        case "t":
        case "T":
          isPanToolActive = false;
          mode = "draw_text";
          event.preventDefault();
          return;
        case "a":
        case "A":
          // bare 'a' → node edit tool (no modifier)
          isPanToolActive = false;
          mode = "edit_nodes";
          event.preventDefault();
          return;
        case "p":
        case "P":
          isPanToolActive = false;
          mode = "draw_path";
          event.preventDefault();
          return;
        case "s":
        case "S":
          isPanToolActive = false;
          mode = "draw_scalebar";
          event.preventDefault();
          return;
        case "h":
        case "H":
          isPanToolActive = false;
          mode = "draw_label";
          event.preventDefault();
          return;
        // ? is handled above the !shift gate
        case "Escape":
          if (showShortcutsHelp) {
            showShortcutsHelp = false;
            return;
          }
          if (showExportDialog) {
            showExportDialog = false;
            return;
          }
          
          if (mode === "draw_path" && pendingObject) {
              if (pendingObject.pathNodes && pendingObject.pathNodes.length > 1) {
                  objects = [...objects, pendingObject];
                  selectedIds = new Set([pendingObject.id]);
                  saveHistory();
              }
              pendingObject = null;
          }

          selectedIds = new Set();
          isSpacePressed = false;
          isPanToolActive = false;
          mode = "select";
          return;
      }
    }

    // ── Escape with nothing else active ─────────────────────────────────────
    if (key === "Escape" && !ctrl) {
      if (showShortcutsHelp) {
        showShortcutsHelp = false;
        event.preventDefault();
        return;
      }
      if (showExportDialog) {
        showExportDialog = false;
        event.preventDefault();
        return;
      }
    }

    // ── Ctrl shortcuts ───────────────────────────────────────────────────────
    if (ctrl) {
      switch (key.toLowerCase()) {
        // Select All (Cmd+A / Ctrl+A) — must be here so it takes priority over bare 'a'
        case "a":
          selectAll();
          event.preventDefault(); // critical: stops browser selecting all DOM text
          return;
        // New canvas
        case "n":
          newCanvas();
          event.preventDefault();
          return;
        // Open / import image
        case "o":
          importImage();
          event.preventDefault();
          return;
        // Save (Ctrl+S) / Export dialog (Ctrl+Shift+E)
        case "s":
          shift ? (showExportDialog = true) : saveProject();
          event.preventDefault();
          return;
        // Ctrl+Shift+E → Export
        case "e":
          if (shift) {
            showExportDialog = true;
            event.preventDefault();
          }
          return;
        // Undo / Redo
        case "z":
          shift ? redo() : undo();
          event.preventDefault();
          return;
        case "y":
          redo();
          event.preventDefault();
          return;
        // Clipboard
        case "c":
          copySelected();
          event.preventDefault();
          return;
        case "x":
          cutSelected();
          event.preventDefault();
          return;
        case "v":
          event.preventDefault();
          // Try system clipboard first (images/text from OS)
          (async () => {
            try {
              if (navigator.clipboard && navigator.clipboard.read) {
                const clipItems = await navigator.clipboard.read();
                let handled = false;
                for (const ci of clipItems) {
                  // Image paste
                  const imageType = ci.types.find((t) =>
                    t.startsWith("image/"),
                  );
                  if (imageType) {
                    const blob = await ci.getType(imageType);
                    const objectUrl = URL.createObjectURL(blob);
                    const img = new Image();
                    img.src = objectUrl;
                    await new Promise((r) => {
                      img.onload = r;
                      img.onerror = r;
                    });
                    const vx = (canvasWidth / 2 - offset.x) / zoom;
                    const vy = (canvasHeight / 2 - offset.y) / zoom;
                    const newImage: CanvasObject = {
                      id: crypto.randomUUID(),
                      type: "image",
                      x: vx - img.naturalWidth / 2,
                      y: vy - img.naturalHeight / 2,
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      src: objectUrl,
                      naturalWidth: img.naturalWidth,
                      naturalHeight: img.naturalHeight,
                      rotation: 0,
                      fill: "transparent",
                    };
                    objects = [...objects, newImage];
                    selectedIds = new Set([newImage.id]);
                    saveHistory();
                    hasStarted = true;
                    handled = true;
                    break;
                  }
                }
                if (!handled) {
                  // Text paste
                  for (const ci of clipItems) {
                    if (ci.types.includes("text/plain")) {
                      const txt = await (await ci.getType("text/plain")).text();
                      if (txt.trim()) {
                        const vx = (canvasWidth / 2 - offset.x) / zoom;
                        const vy = (canvasHeight / 2 - offset.y) / zoom;
                        const newText: CanvasObject = {
                          id: crypto.randomUUID(),
                          type: "text",
                          x: vx - 50,
                          y: vy - 10,
                          width: 200,
                          height: 20,
                          text: txt,
                          fontSize: undefined,
                          fontFamily: undefined,
                          fontWeight: undefined,
                          fontStyle: undefined,
                          fill: undefined,
                          rotation: 0,
                        };
                        objects = [...objects, newText];
                        selectedIds = new Set([newText.id]);
                        saveHistory();
                        hasStarted = true;
                        handled = true;
                        break;
                      }
                    }
                  }
                }
                // If nothing from system clipboard, fall back to internal paste
                if (!handled) pasteClipboard();
              } else {
                pasteClipboard();
              }
            } catch {
              // Permission denied or API unavailable → internal paste
              pasteClipboard();
            }
          })();
          return;
        case "d":
          duplicateSelected();
          event.preventDefault();
          return;
        case "g":
          if (shift) {
            ungroupSelected();
          } else {
            groupSelected();
          }
          event.preventDefault();
          return;
        // Grid / Snap toggles — Ctrl+; toggles grid, Ctrl+Shift+; toggles snap
        // (also keep ' for backwards compat on keyboards where it works)
        case ";":
        case "'":
          if (shift) {
            snapToGrid = !snapToGrid;
          } else {
            showGrid = !showGrid;
          }
          event.preventDefault();
          return;
        // Shortcuts help
        case "/":
          showShortcutsHelp = !showShortcutsHelp;
          event.preventDefault();
          return;
      }
    }

    // ── Arrow key nudge ──────────────────────────────────────────────────────
    if (selectedIds.size > 0 && !textInput.visible) {
      const step = shift ? 10 : 1;
      switch (code) {
        case "ArrowLeft":
          nudgeSelected(-step, 0);
          event.preventDefault();
          break;
        case "ArrowRight":
          nudgeSelected(step, 0);
          event.preventDefault();
          break;
        case "ArrowUp":
          nudgeSelected(0, -step);
          event.preventDefault();
          break;
        case "ArrowDown":
          nudgeSelected(0, step);
          event.preventDefault();
          break;
      }
    }

    // ── Z-Order shortcuts ────────────────────────────────────────────────────
    if (selectedIds.size > 0 && !textInput.visible && shift) {
      if (key === "]") {
        event.altKey ? bringToFront() : bringForward();
        event.preventDefault();
        return;
      }
      if (key === "[") {
        event.altKey ? sendToBack() : sendBackward();
        event.preventDefault();
        return;
      }
    }

    // ── Alignment shortcuts (Shift+Alt+key) ──────────────────────────────────
    if (shift && event.altKey && selectedIds.size >= 2 && !textInput.visible) {
      switch (key.toUpperCase()) {
        case "L":
          alignLeft();
          event.preventDefault();
          return;
        case "C":
          alignCenterH();
          event.preventDefault();
          return;
        case "R":
          alignRight();
          event.preventDefault();
          return;
        case "T":
          alignTop();
          event.preventDefault();
          return;
        case "M":
          alignMiddleV();
          event.preventDefault();
          return;
        case "B":
          alignBottom();
          event.preventDefault();
          return;
        case "H":
          distributeH();
          event.preventDefault();
          return;
        case "V":
          distributeV();
          event.preventDefault();
          return;
      }
    }

    // ── Delete / Backspace ───────────────────────────────────────────────────
    if (code === "Backspace" || code === "Delete") {
      if (textInput.visible) return;
      
      if (mode === "edit_nodes" && selectedNodeId) {
        saveHistory();
        objects = objects.filter((obj) => {
          if (obj.type === "path" && obj.pathNodes && selectedIds.has(obj.id)) {
            const initialLength = obj.pathNodes.length;
            obj.pathNodes = obj.pathNodes.filter(n => n.id !== selectedNodeId);
            if (obj.pathNodes.length < 2 && initialLength >= 2) {
                selectedIds.delete(obj.id); // Destroy path if it has less than 2 points left
                return false;
            }
          }
          return true;
        });
        selectedIds = new Set(selectedIds);
        selectedNodeId = null;
        event.preventDefault();
        return;
      }

      if (selectedIds.size > 0) {
        saveHistory();
        objects = objects.filter((obj) => !selectedIds.has(obj.id));
        selectedIds = new Set();
        event.preventDefault();
      }
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  function selectAll() {
    selectedIds = new Set(objects.map((o) => o.id));
  }

  function selectAllSimilar() {
    if (selectedIds.size === 0) return;
    const firstId = Array.from(selectedIds)[0];
    const first = objects.find((o) => o.id === firstId);
    if (!first) return;
    selectedIds = new Set(
      objects.filter((o) => o.type === first.type).map((o) => o.id),
    );
  }

  // ── Clipboard helpers ───────────────────────────────────────────────────────
  function copySelected() {
    if (selectedIds.size === 0) return;
    clipboard = objects
      .filter((o) => selectedIds.has(o.id))
      .map((o) => JSON.parse(JSON.stringify(o)));
  }

  function cutSelected() {
    if (selectedIds.size === 0) return;
    copySelected();
    saveHistory();
    objects = objects.filter((o) => !selectedIds.has(o.id));
    selectedIds = new Set();
  }

  function pasteClipboard() {
    if (clipboard.length === 0) return;
    saveHistory();
    const pasteOffset = 15;
    const newObjs: CanvasObject[] = clipboard.map((o) => {
      const copy = JSON.parse(JSON.stringify(o)) as CanvasObject;
      copy.id = crypto.randomUUID();
      copy.x = o.x + pasteOffset;
      copy.y = o.y + pasteOffset;
      // Preserve line endpoint offset exactly (don't change angle/length)
      if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
        copy.x2 = o.x2 + pasteOffset;
        copy.y2 = o.y2 + pasteOffset;
      }
      return copy;
    });
    objects = [...objects, ...newObjs];
    selectedIds = new Set(newObjs.map((o) => o.id));
  }

  // ── Interactive Crop Mode ────────────────────────────────────────────────────
  /** When non-null, we are in crop mode for this image object id */
  let cropModeId = $state<string | null>(null);
  /** Which crop handle is being dragged: 'l'|'t'|'r'|'b' or null */
  let activeCropHandle = $state<string | null>(null);

  function enterCropMode(objId: string) {
    cropModeId = objId;
    selectedIds = new Set([objId]);
  }
  function exitCropMode() {
    cropModeId = null;
    activeCropHandle = null;
  }

  // ── System Clipboard Paste (Ctrl+V from OS) ─────────────────────────────────
  async function handleSystemPaste(e: ClipboardEvent) {
    // Skip if a text field is focused (let the browser handle it normally)
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        (active as HTMLElement).isContentEditable)
    ) {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.src = objectUrl;
        await new Promise((r) => (img.onload = r));

        // Place at center of current viewport
        const vx = (canvasWidth / 2 - offset.x) / zoom;
        const vy = (canvasHeight / 2 - offset.y) / zoom;
        const newImage: CanvasObject = {
          id: crypto.randomUUID(),
          type: "image",
          x: vx - img.naturalWidth / 2,
          y: vy - img.naturalHeight / 2,
          width: img.naturalWidth,
          height: img.naturalHeight,
          src: objectUrl,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          rotation: 0,
          fill: "transparent",
        };
        objects = [...objects, newImage];
        selectedIds = new Set([newImage.id]);
        saveHistory();
        hasStarted = true;
        return; // Only paste the first image found
      }
    }

    // If no image found, try pasting as a text object
    for (const item of Array.from(items)) {
      if (item.type === "text/plain") {
        item.getAsString((text) => {
          if (!text.trim()) return;
          const vx = (canvasWidth / 2 - offset.x) / zoom;
          const vy = (canvasHeight / 2 - offset.y) / zoom;
          const newText: CanvasObject = {
            id: crypto.randomUUID(),
            type: "text",
            x: vx - 50,
            y: vy - 10,
            width: 200,
            height: 20,
            text,
            fontSize: undefined,
            fontFamily: undefined,
            fontWeight: undefined,
            fontStyle: undefined,
            fill: undefined,
            rotation: 0,
          };
          objects = [...objects, newText];
          selectedIds = new Set([newText.id]);
          saveHistory();
          hasStarted = true;
        });
        return;
      }
    }
  }

  function duplicateSelected() {
    if (selectedIds.size === 0) return;
    copySelected();
    pasteClipboard();
  }

  function convertToPath(obj: CanvasObject): CanvasObject {
    const nodes: PathNode[] = [];
    if (obj.type === "rectangle") {
      const { x, y, width, height } = obj;
      nodes.push({ id: crypto.randomUUID(), x, y, type: "corner" });
      nodes.push({ id: crypto.randomUUID(), x: x + width, y, type: "corner" });
      nodes.push({ id: crypto.randomUUID(), x: x + width, y: y + height, type: "corner" });
      nodes.push({ id: crypto.randomUUID(), x, y: y + height, type: "corner" });
    } else if (obj.type === "ellipse") {
      const cx = obj.x + obj.width / 2;
      const cy = obj.y + obj.height / 2;
      const rx = obj.width / 2;
      const ry = obj.height / 2;
      const k = 0.5522847;

      // Top
      nodes.push({
        id: crypto.randomUUID(), x: cx, y: cy - ry, type: "smooth",
        cp1x: cx - rx * k, cp1y: cy - ry,
        cp2x: cx + rx * k, cp2y: cy - ry
      });
      // Right
      nodes.push({
        id: crypto.randomUUID(), x: cx + rx, y: cy, type: "smooth",
        cp1x: cx + rx, cp1y: cy - ry * k,
        cp2x: cx + rx, cp2y: cy + ry * k
      });
      // Bottom
      nodes.push({
        id: crypto.randomUUID(), x: cx, y: cy + ry, type: "smooth",
        cp1x: cx + rx * k, cp1y: cy + ry,
        cp2x: cx - rx * k, cp2y: cy + ry
      });
      // Left
      nodes.push({
        id: crypto.randomUUID(), x: cx - rx, y: cy, type: "smooth",
        cp1x: cx - rx, cp1y: cy + ry * k,
        cp2x: cx - rx, cp2y: cy - ry * k
      });
    }

    return {
      ...obj,
      type: "path",
      pathNodes: nodes,
      closed: true
    };
  }

  // ── Group / Ungroup ──────────────────────────────────────────────────────────
  /** ID of the group we've double-clicked into (for group-scope selection) */
  let activeGroupId = $state<string | null>(null);

  function groupSelected() {
    const ids = new Set(selectedIds);
    if (ids.size < 2) return;
    const selected = objects.filter((o) => ids.has(o.id));
    if (selected.length < 2) return;

    // Compute bounding box of all selected objects
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const o of selected) {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + (o.width || 0));
      maxY = Math.max(maxY, o.y + (o.height || 0));
    }

    const group: CanvasObject = {
      id: crypto.randomUUID(),
      type: "group",
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      fill: "transparent",
      children: selected,
    };

    saveHistory();
    // Remove selected from flat list, add group
    objects = [...objects.filter((o) => !ids.has(o.id)), group];
    selectedIds = new Set([group.id]);
  }

  function ungroupSelected() {
    const ids = new Set(selectedIds);
    if (ids.size === 0) return;
    const groups = objects.filter((o) => ids.has(o.id) && o.type === "group");
    if (groups.length === 0) return;
    saveHistory();
    // Flatten recursively
    const newIds = new Set<string>();
    let updated = [...objects];
    for (const grp of groups) {
      const children = grp.children ?? [];
      const idx = updated.indexOf(grp);
      updated.splice(idx, 1, ...children);
      children.forEach((c) => newIds.add(c.id));
    }
    objects = updated;
    selectedIds = newIds;
    activeGroupId = null;
  }

  // ── Nudge helpers ───────────────────────────────────────────────────────────
  function nudgeSelected(dx: number, dy: number) {
    if (selectedIds.size === 0) return;
    saveHistory();
    objects = objects.map((o) => {
      if (!selectedIds.has(o.id)) return o;
      const updated = { ...o, x: o.x + dx, y: o.y + dy };
      // Also move line endpoint if applicable
      if (o.type === "line" && o.x2 !== undefined && o.y2 !== undefined) {
        updated.x2 = o.x2 + dx;
        updated.y2 = o.y2 + dy;
      }
      return updated;
    });
  }

  // ── Canvas state ─────────────────────────────────────────────────────────────
  function newCanvas() {
    if (objects.length === 0) return;
    const confirmed = confirm("Clear the canvas? This cannot be undone.");
    if (!confirmed) return;
    objects = [];
    selectedIds = new Set();
    history = [];
    historyIndex = -1;
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.code === "Space") {
      isSpacePressed = false;
    }
  }

  function applyStyleToAllScaleBars(sourceObj: CanvasObject) {
    if (sourceObj.type !== "scalebar") return;

    const propsToSync = {
      labelPosition: sourceObj.labelPosition,
      backgroundColor: sourceObj.backgroundColor,
      backgroundOpacity: sourceObj.backgroundOpacity,
      fill: sourceObj.fill,
      stroke: sourceObj.stroke,
      strokeWidth: sourceObj.strokeWidth,
      fontFamily: sourceObj.fontFamily,
      fontSize: sourceObj.fontSize,
      fontWeight: sourceObj.fontWeight,
      fontStyle: sourceObj.fontStyle,
    };

    let changed = false;
    for (const obj of objects) {
      if (obj.type === "scalebar" && obj.id !== sourceObj.id) {
        Object.assign(obj, propsToSync);
        changed = true;
      }
    }
    if (changed) saveHistory();
  }

  /**
   * Strips all explicit style overrides from every object so they
   * all inherit from the current globalTheme.
   */
  function applyThemeToAll() {
    const styleKeys: (keyof CanvasObject)[] = [
      "fill", "stroke", "strokeWidth", "lineDash",
      "fontFamily", "fontSize", "fontWeight", "fontStyle"
    ];
    for (const obj of objects) {
      for (const k of styleKeys) {
        (obj as any)[k] = undefined;
      }
    }
    saveHistory();
  }

  function handleDoubleClick(e: MouseEvent) {
    if (mode === "draw_path" && pendingObject && pendingObject.pathNodes && pendingObject.pathNodes.length > 0) {
      objects = [...objects, pendingObject];
      selectedIds = new Set([pendingObject.id]);
      pendingObject = null;
      saveHistory();
      mode = "select";
      return;
    }

    if (mode !== "select") return;

    // Check what we double-clicked
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Hit test ignoring group scope to allow entering groups, or just regular hit test
    // Actually our hit test currently returns the top-level object
    // For now, let's just see what is currently selected (since single click selected it first)
    if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0];
      const obj = objects.find((o) => o.id === id);
      if (obj) {
        if (obj.type === "image") {
          enterCropMode(obj.id);
        } else if (obj.type === "group") {
          // Enter group scope
          activeGroupId = obj.id;
          selectedIds.clear(); // Deselect the group itself, ready to select children
        }
      }
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
          fontSize: undefined,
          fontFamily: undefined,
          fontWeight: undefined,
          fontStyle: undefined,
          fill: undefined,
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
        offset.x += e.clientX - dragStart.x;
        offset.y += e.clientY - dragStart.y;
        dragStart = { x: e.clientX, y: e.clientY };
      } else if (mode === "move") {
        activeGuides = [];

        // Calculate total movement from start
        const dx = (e.clientX - dragStart.x) / zoom;
        const dy = (e.clientY - dragStart.y) / zoom;

        if (selectionSnapshot.size > 0) {
          const primaryId = Array.from(selectedIds)[0];
          const original = selectionSnapshot.get(primaryId);
          const primaryObj = objects.find((o) => o.id === primaryId);

          let finalDx = dx;
          let finalDy = dy;

          if (original && primaryObj) {
            // Determine limits
            const threshold = SNAP_TOLERANCE / zoom;
            let minDistX = threshold;
            let minDistY = threshold;

            // Current proposed positions based on raw mouse move
            const newX = original.x + dx;
            const newY = original.y + dy;

            // Candidates on the moving object
            const l = newX;
            const c = newX + primaryObj.width / 2;
            const r = newX + primaryObj.width;

            const t = newY;
            const m = newY + primaryObj.height / 2;
            const b = newY + primaryObj.height;

            // Object Snapping
            for (const target of objects) {
              if (selectedIds.has(target.id)) continue;

              const tl = target.x;
              const tc = target.x + target.width / 2;
              const tr = target.x + target.width;

              const tt = target.y;
              const tm = target.y + target.height / 2;
              const tb = target.y + target.height;

              // Vertical Snaps (X axis)
              const vTargets = [tl, tc, tr];
              const vSources = [l, c, r];

              for (const vt of vTargets) {
                for (const vs of vSources) {
                  const dist = Math.abs(vt - vs);
                  if (dist < minDistX) {
                    minDistX = dist;
                    finalDx = dx + (vt - vs); // Adjust delta to snap

                    // Create Guide
                    activeGuides = activeGuides.filter(
                      (g) => g.type !== "vertical",
                    );
                    activeGuides.push({
                      type: "vertical",
                      offset: vt,
                      start: Math.min(newY, target.y) - 20 / zoom,
                      end:
                        Math.max(
                          newY + primaryObj.height,
                          target.y + target.height,
                        ) +
                        20 / zoom,
                    });
                  }
                }
              }

              // Horizontal Snaps (Y axis)
              const hTargets = [tt, tm, tb];
              const hSources = [t, m, b];

              for (const ht of hTargets) {
                for (const hs of hSources) {
                  const dist = Math.abs(ht - hs);
                  if (dist < minDistY) {
                    minDistY = dist;
                    finalDy = dy + (ht - hs); // Adjust delta

                    // Create Guide
                    activeGuides = activeGuides.filter(
                      (g) => g.type !== "horizontal",
                    );
                    activeGuides.push({
                      type: "horizontal",
                      offset: ht,
                      start: Math.min(newX, target.x) - 20 / zoom,
                      end:
                        Math.max(
                          newX + primaryObj.width,
                          target.x + target.width,
                        ) +
                        20 / zoom,
                    });
                  }
                }
              }
            }

            // Grid Snapping (if no object snap found)
            if (snapToGrid) {
              if (minDistX >= threshold) {
                const closestGridX = Math.round(l / gridSize) * gridSize;
                if (Math.abs(closestGridX - l) < threshold) {
                  finalDx = dx + (closestGridX - l);
                  // No visual guide for grid snap usually, but could add one
                }
              }
              if (minDistY >= threshold) {
                const closestGridY = Math.round(t / gridSize) * gridSize;
                if (Math.abs(closestGridY - t) < threshold) {
                  finalDy = dy + (closestGridY - t);
                }
              }
            }
          }

          // Apply finalized movement
          for (const obj of objects) {
            const init = selectionSnapshot.get(obj.id);
            if (init) {
              obj.x = init.x + finalDx;
              obj.y = init.y + finalDy;

              if (obj.type === "path" && init.pathNodes) {
                obj.pathNodes = init.pathNodes.map((n: any) => ({
                  ...n,
                  x: n.x + finalDx,
                  y: n.y + finalDy,
                  cp1x: n.cp1x !== undefined ? n.cp1x + finalDx : undefined,
                  cp1y: n.cp1y !== undefined ? n.cp1y + finalDy : undefined,
                  cp2x: n.cp2x !== undefined ? n.cp2x + finalDx : undefined,
                  cp2y: n.cp2y !== undefined ? n.cp2y + finalDy : undefined,
                }));
              }

              if (obj.type === "scalebar" && obj.parentId) {
                obj.presetPosition = "custom";
                const parent = objects.find((o) => o.id === obj.parentId);
                if (parent) {
                  const scaleFactor =
                    parent.width / (parent.naturalWidth || parent.width);
                  obj.offsetX = (obj.x - parent.x) / scaleFactor;
                  obj.offsetY = (obj.y - parent.y) / scaleFactor;
                }
              }

              if (
                obj.type === "line" &&
                init.x2 !== undefined &&
                init.y2 !== undefined
              ) {
                obj.x2 = init.x2 + finalDx;
                obj.y2 = init.y2 + finalDy;
              }
            }
          }
        }
      } else if (mode === "rotate" && activeHandle && initialState) {
        // Rotation Logic
        const obj = objects.find((o) => o.id === initialState!.id);
        if (obj) {
          // Center of object
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
        // Resize / Crop Logic
        const obj = objects.find((o) => o.id === initialState!.id);
        if (obj) {
          if (cropModeId === obj.id && obj.type === "image") {
            // -- Crop Dragging Logic --
            const img = imageCache.get(obj.src!);
            if (!img) return;
            const nw = img.naturalWidth || obj.width;
            const nh = img.naturalHeight || obj.height;
            const cl = initialState!.cropLeft ?? 0;
            const ct = initialState!.cropTop ?? 0;
            const cr = initialState!.cropRight ?? 0;
            const cb = initialState!.cropBottom ?? 0;
            const sw = nw - cl - cr;
            const sh = nh - ct - cb;
            if (sw <= 0 || sh <= 0) return;

            const scaleX = initialState!.width / sw;
            const scaleY = initialState!.height / sh;

            // Raw movement
            const totalDx = (e.clientX - dragStart.x) / zoom;
            const totalDy = (e.clientY - dragStart.y) / zoom;

            // We must update the crop inset amounts AND adjusting obj.x/y/width/height
            // to keep the anchor pinned where we aren't dragging.
            let newCL = cl;
            let newCT = ct;
            let newCR = cr;
            let newCB = cb;

            // Convert pixels moved back into natural dimensions
            const pX = totalDx / scaleX;
            const pY = totalDy / scaleY;

            if (activeHandle.includes("w"))
              newCL = Math.max(0, Math.min(nw - cr - 10, cl + pX));
            if (activeHandle.includes("e"))
              newCR = Math.max(0, Math.min(nw - cl - 10, cr - pX));
            if (activeHandle.includes("n"))
              newCT = Math.max(0, Math.min(nh - cb - 10, ct + pY));
            if (activeHandle.includes("s"))
              newCB = Math.max(0, Math.min(nh - ct - 10, cb - pY));

            // Compute new display size and position
            const newSW = nw - newCL - newCR;
            const newSH = nh - newCT - newCB;

            obj.cropLeft = newCL;
            obj.cropTop = newCT;
            obj.cropRight = newCR;
            obj.cropBottom = newCB;
            obj.width = newSW * scaleX;
            obj.height = newSH * scaleY;

            if (activeHandle.includes("w"))
              obj.x =
                initialState.x +
                (newCL - (initialState.cropLeft || 0)) * scaleX;
            if (activeHandle.includes("n"))
              obj.y =
                initialState.y + (newCT - (initialState.cropTop || 0)) * scaleY;
          } else {
            // -- Standard Resize Logic --
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
            if (
              e.shiftKey &&
              initialState.width > 0 &&
              initialState.height > 0
            ) {
              const ratio = initialState.width / initialState.height;
              const isHoriz =
                activeHandle.includes("e") || activeHandle.includes("w");
              const isVert =
                activeHandle.includes("n") || activeHandle.includes("s");
              const isBoth = isHoriz && isVert; // corner handle

              if (isBoth) {
                // Corner drag: use the larger delta to drive both axes
                if (
                  Math.abs(newW - initialState.width) >=
                  Math.abs(newH - initialState.height) * ratio
                ) {
                  // Width is driving
                  newH = newW / ratio;
                  if (activeHandle.includes("n")) {
                    newY = initialState.y + initialState.height - newH;
                  }
                } else {
                  // Height is driving
                  newW = newH * ratio;
                  if (activeHandle.includes("w")) {
                    newX = initialState.x + initialState.width - newW;
                  }
                }
              } else if (isHoriz) {
                // Edge handle — width drives height
                newH = newW / ratio;
              } else if (isVert) {
                // Edge handle — height drives width
                newW = newH * ratio;
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

            if (obj.type === "path" && initialState && initialState.pathNodes && initialState.width && initialState.height) {
              const initX = initialState.x;
              const initY = initialState.y;
              const scaleX = newW / initialState.width;
              const scaleY = newH / initialState.height;
              obj.pathNodes = initialState.pathNodes.map((n: any) => ({
                ...n,
                x: newX + (n.x - initX) * scaleX,
                y: newY + (n.y - initY) * scaleY,
                cp1x: n.cp1x !== undefined ? newX + (n.cp1x - initX) * scaleX : undefined,
                cp1y: n.cp1y !== undefined ? newY + (n.cp1y - initY) * scaleY : undefined,
                cp2x: n.cp2x !== undefined ? newX + (n.cp2x - initX) * scaleX : undefined,
                cp2y: n.cp2y !== undefined ? newY + (n.cp2y - initY) * scaleY : undefined,
              }));
            }

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
              }
            }
          }
        }
      } else if (mode === "marquee") {
        // marquee
        if (selectionRect) {
          selectionRect.w = worldPos.x - selectionRect.x;
          selectionRect.h = worldPos.y - selectionRect.y;
          render(); // Show selection rectangle while dragging
        }
      } else if (
        (mode === "draw_rectangle" || mode === "draw_ellipse" || mode === "draw_arc") &&
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
      } else if (mode === "draw_path" && pendingObject && pendingObject.pathNodes) {
        const lastNode = pendingObject.pathNodes[pendingObject.pathNodes.length - 1];
        if (activeHandle === "cp2") {
            const currentWorld = screenToWorld(e.clientX, e.clientY);
            lastNode.cp2x = currentWorld.x;
            lastNode.cp2y = currentWorld.y;
            // Mirror cp1
            lastNode.cp1x = lastNode.x - (currentWorld.x - lastNode.x);
            lastNode.cp1y = lastNode.y - (currentWorld.y - lastNode.y);
        }
      } else if (mode === "edit_nodes" && activeHandle?.startsWith("node_")) {
          // Extract nodeid and handle type
          const parts = activeHandle.split("_");
          const nodeId = parts[1];
          const handleType = parts[2];
          
          const currentWorld = screenToWorld(e.clientX, e.clientY);
          
          for (const objId of selectedIds) {
              const obj = objects.find(o => o.id === objId);
              if (obj?.type === "path" && obj.pathNodes) {
                  const n = obj.pathNodes.find(n => n.id === nodeId);
                  if (n) {
                      // Account for object rotation when dragging nodes
                      const cx = obj.x + obj.width / 2;
                      const cy = obj.y + obj.height / 2;
                      const cos = Math.cos(-(obj.rotation || 0));
                      const sin = Math.sin(-(obj.rotation || 0));
                      const mdx = currentWorld.x - cx;
                      const mdy = currentWorld.y - cy;
                      const localX = cx + mdx * cos - mdy * sin;
                      const localY = cy + mdx * sin + mdy * cos;

                      if (handleType === "anchor") {
                          const dx = localX - n.x;
                          const dy = localY - n.y;
                          n.x = localX;
                          n.y = localY;
                          if (n.cp1x !== undefined) { n.cp1x += dx; n.cp1y! += dy; }
                          if (n.cp2x !== undefined) { n.cp2x += dx; n.cp2y! += dy; }
                      } else if (handleType === "cp1") {
                          n.cp1x = localX; n.cp1y = localY;
                          if (n.type === "smooth" && n.cp2x !== undefined) {
                              n.cp2x = n.x - (localX - n.x);
                              n.cp2y = n.y - (localY - n.y);
                          }
                      } else if (handleType === "cp2") {
                          n.cp2x = localX; n.cp2y = localY;
                          if (n.type === "smooth" && n.cp1x !== undefined) {
                              n.cp1x = n.x - (localX - n.x);
                              n.cp1y = n.y - (localY - n.y);
                          }
                      }
                  }
              }
          }
      } else if (mode === "edit_nodes" && activeHandle?.startsWith("arc_")) {
          const parts = activeHandle.split("_");
          const objId = parts[1];
          const type = parts[2]; // "start" or "end"
          
          const obj = objects.find(o => o.id === objId);
          if (obj && obj.type === "arc") {
              const currentWorld = screenToWorld(e.clientX, e.clientY);
              const ecx = obj.x + obj.width / 2;
              const ecy = obj.y + obj.height / 2;
              
              // Local space transformation (inverse rotation)
              const cos = Math.cos(-(obj.rotation || 0));
              const sin = Math.sin(-(obj.rotation || 0));
              const dx = currentWorld.x - ecx;
              const dy = currentWorld.y - ecy;
              const lx = dx * cos - dy * sin;
              const ly = dx * sin + dy * cos;
              
              const angle = Math.atan2(ly, lx);
              
              if (type === "start") {
                  obj.startAngle = angle;
              } else {
                  obj.endAngle = angle;
              }
          }
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
    activeGuides = []; // Clear guides
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
        mode === "draw_arc" ||
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
        if (objects.some((o) => o.id === pendingObject!.id)) {
          console.error(
            "CRITICAL: DUPLICATE ID IN ONMOUSEUP",
            pendingObject!.id,
          );
          pendingObject!.id = crypto.randomUUID();
        }
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

  let fileInput: HTMLInputElement;

  function newProject() {
    if (confirm("Create new project? Unsaved changes will be lost.")) {
      objects = [];
      selectedIds.clear();
      saveHistory();
      hasStarted = false;
    }
  }

  function handleWelcomeNew() {
    hasStarted = true;
  }

  function handleWelcomeOpen() {
    hasStarted = true;
    fileInput?.click();
  }

  function handleWelcomeImport() {
    hasStarted = true;
    importImage();
  }

  async function saveProject() {
    if (isTauri()) {
      const path = await save({
        filters: [
          { name: "SciFigura Project", extensions: ["sfs"] },
          { name: "Legacy SciFigura Project", extensions: ["json"] }
        ],
        defaultPath: "my_figure.sfs",
      });
      if (path) {
        if (path.endsWith(".json")) {
           const data = JSON.stringify(objects, null, 2);
           await writeFile(path, new TextEncoder().encode(data));
        } else {
           const archiveBytes = await saveSfsArchive(objects, globalTheme);
           await writeFile(path, archiveBytes);
        }
        // Clear recovery file cleanly after an explicit external save
        await remove("recovery.json", { baseDir: BaseDirectory.AppData }).catch(() => {});
      }
    } else {
      // Web fallback
      const archiveBytes = await saveSfsArchive(objects, globalTheme);
      const blob = new Blob([archiveBytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scifigura_project.sfs";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function onFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    if (file.name.endsWith(".sfs")) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const buffer = ev.target?.result as ArrayBuffer;
          const { objects: parsedObjects, theme: parsedTheme } = await loadSfsArchive(buffer);
          objects = parsedObjects;
          if (parsedTheme) globalTheme = parsedTheme;
          selectedIds.clear();
          saveHistory();
          hasStarted = true;
        } catch (err) {
          console.error("Failed to load .sfs project", err);
          alert("Failed to load .sfs project: " + err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Legacy JSON fallback
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const json = ev.target?.result as string;
          const parsedObjects = JSON.parse(json) as CanvasObject[];

          // Hydrate images to avoid cross-origin WKWebView filtering issues
          if (isTauri()) {
            for (const obj of parsedObjects) {
              if (obj.type === "image" && obj.originalPath) {
                try {
                  const bytes = await readFile(obj.originalPath);
                  const blob = new Blob([bytes]);
                  obj.src = URL.createObjectURL(blob);
                } catch (err) {
                  console.error(
                    "Failed to restore image from " + obj.originalPath,
                    err,
                  );
                }
              }
            }
          }

          objects = parsedObjects;
          selectedIds.clear();
          saveHistory();
          hasStarted = true;
        } catch (err) {
          alert("Failed to load project");
        }
      };
      reader.readAsText(file);
    }
  }

  async function handleExport() {
    isExporting = true;
    try {
      const blob = await exportCanvas(objects, exportConfig, imageCache, globalTheme);
      if (!blob) {
        alert("Export failed: Empty canvas or error.");
        isExporting = false;
        return;
      }

      if (isTauri()) {
        // Tauri Save Dialog
        const ext = exportConfig.format;
        const path = await save({
          filters: [
            {
              name: exportConfig.format.toUpperCase(),
              extensions: [ext],
            },
          ],
        });

        if (path) {
          const buffer = await blob.arrayBuffer();
          await writeFile(path, new Uint8Array(buffer));
          showExportDialog = false;
        }
      } else {
        // Web Fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `figure_export.${exportConfig.format}`;
        a.click();
        URL.revokeObjectURL(url);
        showExportDialog = false;
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed: " + err);
    } finally {
      isExporting = false;
    }
  }

  // Legacy export functions replaced by dialog
  // Keeping them momentarily or removing? Removing to clean up.
</script>

<svelte:window
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  onpaste={handleSystemPaste}
  ondblclick={handleDoubleClick}
  onresize={() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
  }}
/>

<!-- Layout Container -->
<div class="app-layout">
  <!-- Left Sidebar: Toolbox -->
  <Toolbox {mode} {setMode} {importImage} {isPanToolActive} />

  <input
    type="file"
    accept="image/*,application/pdf,.svg,.pdf"
    style="display: none;"
    bind:this={imageInput}
    onchange={handleBrowserFileSelect}
  />

  <input
    type="file"
    accept=".json"
    bind:this={fileInput}
    onchange={onFileSelect}
    style="display: none;"
  />

  <!-- Center: Canvas Area -->
  <div class="canvas-area">
    <!-- Top Bar (Context/File) -->
    <div class="top-bar">
      <!-- File Operations -->
      <div class="menu-group">
        <button
          onclick={newProject}
          title="New Project (Ctrl+N)"
          class="icon-text-btn"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            /><polyline points="14 2 14 8 20 8" /></svg
          >
          New
        </button>
        <button
          onclick={() => fileInput.click()}
          title="Open Project (Ctrl+O)"
          class="icon-text-btn"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            /></svg
          >
          Open
        </button>
        <button
          onclick={saveProject}
          title="Save Project (Ctrl+S)"
          class="icon-text-btn"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path
              d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
            /><polyline points="17 21 17 13 7 13 7 21" /><polyline
              points="7 3 7 8 15 8"
            /></svg
          >
          Save
        </button>
        <button
          onclick={importImage}
          title="Import Image/Vector"
          class="icon-text-btn"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle
              cx="8.5"
              cy="8.5"
              r="1.5"
            /><polyline points="21 15 16 10 5 21" /></svg
          >
          Import
        </button>
      </div>

      <div class="divider-v"></div>

      <!-- Edit Operations -->
      <div class="menu-group">
        <button
          onclick={undo}
          title="Undo (Ctrl+Z)"
          class="icon-btn"
          aria-label="Undo"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><polyline points="9 14 4 9 9 4" /><path
              d="M20 20v-7a4 4 0 0 0-4-4H4"
            /></svg
          >
        </button>
        <button
          onclick={redo}
          title="Redo (Ctrl+Shift+Z)"
          class="icon-btn"
          aria-label="Redo"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><polyline points="15 14 20 9 15 4" /><path
              d="M4 20v-7a4 4 0 0 1 4-4h12"
            /></svg
          >
        </button>
      </div>

      <div class="divider-v"></div>

      <!-- Z-Order Toolbar (shown when 1+ object selected) -->
      {#if selectedIds.size >= 1}
        <div class="menu-group align-group">
          <button
            onclick={bringToFront}
            title="Bring to Front (Shift+Alt+])"
            class="icon-btn"
            aria-label="Bring to Front"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="10" width="11" height="11" rx="1" />
              <rect
                x="8"
                y="5"
                width="11"
                height="11"
                rx="1"
                fill="currentColor"
                stroke="currentColor"
              />
            </svg>
          </button>
          <button
            onclick={bringForward}
            title="Bring Forward (Shift+])"
            class="icon-btn"
            aria-label="Bring Forward"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="12" width="10" height="10" rx="1" />
              <rect x="9" y="7" width="10" height="10" rx="1" />
              <polyline points="12 2 12 7" />
              <polyline points="10 4 12 2 14 4" />
            </svg>
          </button>
          <button
            onclick={sendBackward}
            title="Send Backward (Shift+[)"
            class="icon-btn"
            aria-label="Send Backward"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="12" width="10" height="10" rx="1" />
              <rect x="9" y="7" width="10" height="10" rx="1" />
              <polyline points="12 12 12 17" />
              <polyline points="10 15 12 17 14 15" />
            </svg>
          </button>
          <button
            onclick={sendToBack}
            title="Send to Back (Shift+Alt+[)"
            class="icon-btn"
            aria-label="Send to Back"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="8" y="5" width="11" height="11" rx="1" />
              <rect
                x="3"
                y="10"
                width="11"
                height="11"
                rx="1"
                fill="currentColor"
                stroke="currentColor"
              />
            </svg>
          </button>
        </div>
        <div class="divider-v"></div>
      {/if}

      <!-- Alignment Toolbar (shown when 2+ objects selected) -->

      {#if selectedIds.size >= 2}
        <div class="menu-group align-group">
          <button
            onclick={alignLeft}
            title="Align Left (Shift+Alt+L)"
            class="icon-btn"
            aria-label="Align Left"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="3" x2="3" y2="21" />
              <rect x="5" y="6" width="10" height="5" rx="1" />
              <rect x="5" y="13" width="14" height="5" rx="1" />
            </svg>
          </button>
          <button
            onclick={alignCenterH}
            title="Align Center (Horizontal) (Shift+Alt+C)"
            class="icon-btn"
            aria-label="Align Center H"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="3" x2="12" y2="21" />
              <rect x="4" y="6" width="16" height="5" rx="1" />
              <rect x="7" y="13" width="10" height="5" rx="1" />
            </svg>
          </button>
          <button
            onclick={alignRight}
            title="Align Right (Shift+Alt+R)"
            class="icon-btn"
            aria-label="Align Right"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="21" y1="3" x2="21" y2="21" />
              <rect x="5" y="6" width="14" height="5" rx="1" />
              <rect x="9" y="13" width="10" height="5" rx="1" />
            </svg>
          </button>

          <div class="divider-v" style="height:14px;"></div>

          <button
            onclick={alignTop}
            title="Align Top (Shift+Alt+T)"
            class="icon-btn"
            aria-label="Align Top"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="3" x2="21" y2="3" />
              <rect x="6" y="5" width="5" height="10" rx="1" />
              <rect x="13" y="5" width="5" height="14" rx="1" />
            </svg>
          </button>
          <button
            onclick={alignMiddleV}
            title="Align Middle (Vertical) (Shift+Alt+M)"
            class="icon-btn"
            aria-label="Align Middle V"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <rect x="6" y="4" width="5" height="16" rx="1" />
              <rect x="13" y="7" width="5" height="10" rx="1" />
            </svg>
          </button>
          <button
            onclick={alignBottom}
            title="Align Bottom (Shift+Alt+B)"
            class="icon-btn"
            aria-label="Align Bottom"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="21" x2="21" y2="21" />
              <rect x="6" y="5" width="5" height="14" rx="1" />
              <rect x="13" y="9" width="5" height="10" rx="1" />
            </svg>
          </button>

          <div class="divider-v" style="height:14px;"></div>

          <button
            onclick={distributeH}
            title="Distribute Horizontally (Shift+Alt+H)"
            class="icon-btn"
            aria-label="Distribute H"
            class:btn-disabled={selectedIds.size < 3}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="3" x2="3" y2="21" />
              <line x1="21" y1="3" x2="21" y2="21" />
              <rect x="8" y="7" width="8" height="10" rx="1" />
            </svg>
          </button>
          <button
            onclick={distributeV}
            title="Distribute Vertically (Shift+Alt+V)"
            class="icon-btn"
            aria-label="Distribute V"
            class:btn-disabled={selectedIds.size < 3}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="3" x2="21" y2="3" />
              <line x1="3" y1="21" x2="21" y2="21" />
              <rect x="7" y="8" width="10" height="8" rx="1" />
            </svg>
          </button>
        </div>

        <div class="divider-v"></div>
      {/if}

      <div class="menu-group">
        <button
          onclick={() => (showExportDialog = true)}
          title="Export Figure (Ctrl+Shift+E)"
          class="icon-text-btn export-btn"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
              points="17 8 12 3 7 8"
            /><line x1="12" y1="3" x2="12" y2="15" /></svg
          >
          Export…
        </button>
      </div>

      <div class="divider-v"></div>

      <!-- Paper Size Picker -->
      <div class="menu-group" style="position:relative;">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#555"
          stroke-width="2"
          style="flex-shrink:0"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <select
          value={paperKey}
          onchange={(e) => {
          const val = e.currentTarget.value;
          if (val === "manage-presets") {
            // Revert the select visually back to the actual current selected key
            e.currentTarget.value = paperKey;
            showPresetManager = true;
          } else {
            requestPaperChange(val);
          }
        }}
          class="paper-select"
          title="Paper size"
        >
          {#each PAPER_SIZES as ps}
            <option value={ps.key}>{ps.label}</option>
          {/each}
          <option disabled>──────────</option>
          <option value="manage-presets">Manage Custom Presets...</option>
        </select>
        {#if paperKey === "custom"}
          <input
            type="number"
            value={customPaperW}
            oninput={(e) => {
              customPaperW = +e.currentTarget.value || 800;
              tick().then(centerCanvas);
            }}
            title="Custom width (px)"
            class="paper-custom"
          />
          <span style="color:#555;font-size:10px">×</span>
          <input
            type="number"
            value={customPaperH}
            oninput={(e) => {
              customPaperH = +e.currentTarget.value || 600;
              tick().then(centerCanvas);
            }}
            title="Custom height (px)"
            class="paper-custom"
          />
        {:else}
          <span class="paper-dims">{resolvedW} × {resolvedH}</span>
        {/if}
      </div>

      <div class="divider-v"></div>

      <!-- Layout Presets Button -->
      <div class="menu-group" style="position:relative;">
        <button
          onclick={() => (showLayoutPanel = !showLayoutPanel)}
          class="icon-text-btn {showLayoutPanel ? 'layout-active' : ''}"
          title="Layout presets"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="7" height="7" /><rect
              x="14"
              y="3"
              width="7"
              height="7"
            />
            <rect x="3" y="14" width="7" height="7" /><rect
              x="14"
              y="14"
              width="7"
              height="7"
            />
          </svg>
          Layouts
        </button>
        {#if showLayoutPanel}
          <LayoutPresets
            paperW={resolvedW}
            paperH={resolvedH}
            onApply={(newObjs) => {
              objects = [...objects, ...newObjs];
              saveHistory();
              showLayoutPanel = false;
              hasStarted = true;
            }}
            onClose={() => (showLayoutPanel = false)}
          />
        {/if}
      </div>

      <!-- Spacer -->
      <div style="flex: 1;"></div>

      <div class="menu-group">
        <!-- Zoom Controls -->
        <button
          onclick={() => {
            zoom = 1.0;
            centerCanvas();
          }}
          title="Reset Zoom (100%)"
          class="icon-btn"
          aria-label="Reset zoom"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            ><circle cx="11" cy="11" r="8" /><line
              x1="21"
              y1="21"
              x2="16.65"
              y2="16.65"
            /><line x1="11" y1="8" x2="11" y2="14" /><line
              x1="8"
              y1="11"
              x2="14"
              y2="11"
            /></svg
          >
        </button>
        <div
          style="display: flex; align-items: center; gap: 4px; background: #333; padding: 2px 6px; border-radius: 4px;"
        >
          <input
            type="number"
            value={Math.round(zoom * 100)}
            onchange={(e) => {
              const val = parseFloat(e.currentTarget.value);
              if (!isNaN(val) && val > 0) {
                zoom = val / 100;
              }
            }}
            style="width: 36px; background: transparent; border: none; color: white; font-size: 11px; text-align: right; outline: none;"
          />
          <span style="font-size: 11px; color: #888;">%</span>
        </div>

        <div class="divider-v"></div>

        <!-- About button -->
        <button
          onclick={() => (showAboutDialog = true)}
          title="About SciFigura"
          class="icon-btn"
          aria-label="About"
          style="color: #555;"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </button>

        <!-- Send Feedback button -->
        <button
          onclick={() => {
            const url = "https://github.com/feldaher/scifigura/discussions";
            if (isTauri()) {
              import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url));
            } else {
              window.open(url, "_blank");
            }
          }}
          title="Send Feedback"
          class="icon-btn"
          aria-label="Send Feedback"
          style="color: #555;"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Welcome Screen — shown on first launch when canvas is empty -->
    {#if !hasStarted && objects.length === 0}
      <WelcomeScreen
        onNew={handleWelcomeNew}
        onOpen={handleWelcomeOpen}
        onImport={handleWelcomeImport}
      />
    {/if}

    <AboutDialog bind:show={showAboutDialog} />

    <ScaleBarPromptDialog
      isOpen={isScaleBarPromptOpen}
      imageWidth={scaleBarTargetImage ? scaleBarTargetImage.width : 0}
      onConfirm={onScaleBarConfirm}
      onCancel={onScaleBarCancel}
    />

    <ReformatDialog
      isOpen={showReformatDialog}
      fromLabel={reformatFromLabel}
      toLabel={reformatToLabel}
      onScale={applyReformat}
      onReflow={applyReflow}
      onCancel={cancelReformat}
    />

    {#if fontWarnings.length > 0}
      <div class="font-warnings-toast">
        <strong>⚠ Font size warnings:</strong>
        <ul>
          {#each fontWarnings as w}
            <li>{w}</li>
          {/each}
        </ul>
        <button onclick={() => (fontWarnings = [])}>Dismiss</button>
      </div>
    {/if}
    <!--
        Canvas fills the remaining area
    -->
    <canvas
      bind:this={canvas}
      bind:clientWidth={canvasWidth}
      bind:clientHeight={canvasHeight}
      width={canvasWidth}
      height={canvasHeight}
      onwheel={handleWheel}
      onmousedown={onMouseDown}
      onmousemove={onMouseMove}
      onmouseup={onMouseUp}
      onmouseleave={onMouseUp}
      oncontextmenu={openContextMenu}
      style="display: block; width: 100%; height: 100%; cursor: {isSpacePressed ||
      isPanToolActive
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

    <!-- Context Menu -->
    <PresetManagerDialog
    isOpen={showPresetManager}
    presets={customPresets}
    onSave={handleSavePresets}
    onCancel={() => (showPresetManager = false)}
  />

  {#if contextMenu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="ctx-backdrop"
        onclick={closeContextMenu}
        oncontextmenu={(e) => {
          e.preventDefault();
          closeContextMenu();
        }}
      ></div>
      <div
        class="ctx-menu"
        style="left:{contextMenu.x}px; top:{contextMenu.y}px;"
      >
        {#if contextMenu.objectId || selectedIds.size > 0}
          <button
            class="ctx-item"
            onclick={() => {
              bringToFront();
              closeContextMenu();
            }}>Bring to Front <span class="ctx-key">⇧⌥]</span></button
          >
          <button
            class="ctx-item"
            onclick={() => {
              bringForward();
              closeContextMenu();
            }}>Bring Forward <span class="ctx-key">⇧]</span></button
          >
          <button
            class="ctx-item"
            onclick={() => {
              sendBackward();
              closeContextMenu();
            }}>Send Backward <span class="ctx-key">⇧[</span></button
          >
          <button
            class="ctx-item"
            onclick={() => {
              sendToBack();
              closeContextMenu();
            }}>Send to Back <span class="ctx-key">⇧⌥[</span></button
          >
          <div class="ctx-sep"></div>
          <button
            class="ctx-item"
            onclick={() => {
              copySelected();
              closeContextMenu();
            }}>Copy <span class="ctx-key">⌘C</span></button
          >
          <button
            class="ctx-item"
            onclick={() => {
              cutSelected();
              closeContextMenu();
            }}>Cut <span class="ctx-key">⌘X</span></button
          >
          <button
            class="ctx-item"
            onclick={() => {
              duplicateSelected();
              closeContextMenu();
            }}>Duplicate <span class="ctx-key">⌘D</span></button
          >
          <div class="ctx-sep"></div>
          <button
            class="ctx-item ctx-danger"
            onclick={() => {
              saveHistory();
              objects = objects.filter((o) => !selectedIds.has(o.id));
              selectedIds = new Set();
              closeContextMenu();
            }}>Delete <span class="ctx-key">⌫</span></button
          >
        {:else}
          <button
            class="ctx-item"
            onclick={() => {
              pasteClipboard();
              closeContextMenu();
            }}>Paste <span class="ctx-key">⌘V</span></button
          >
        {/if}
      </div>
    {/if}

    <div class="status-bar">
      <!-- Tool indicator -->
      <span class="status-segment">
        <span class="status-label">Tool</span>
        {#if isPanToolActive}
          Pan
        {:else if mode === "select"}
          Select
        {:else if mode === "draw_rectangle"}
          Rectangle
        {:else if mode === "draw_ellipse"}
          Ellipse
        {:else if mode === "draw_line"}
          Line
        {:else if mode === "draw_text"}
          Text
        {:else if mode === "draw_scalebar"}
          Scale Bar
        {:else if mode === "draw_label"}
          Panel Label
        {:else}
          {mode}
        {/if}
      </span>
      <span class="status-divider">|</span>
      <!-- Cursor world position -->
      <span class="status-segment">
        <span class="status-label">X</span>{Math.round(
          (lastMousePos.x - offset.x) / zoom,
        )}
        <span class="status-label" style="margin-left:6px">Y</span>{Math.round(
          (lastMousePos.y - offset.y) / zoom,
        )}
      </span>
      <span class="status-divider">|</span>
      <!-- Selection & object count -->
      <span class="status-segment">
        {#if selectedIds.size > 0}
          <span style="color:#5aabff">{selectedIds.size} selected</span>
        {:else}
          <span style="color:#555">none selected</span>
        {/if}
        &nbsp;·&nbsp;{objects.length} object{objects.length === 1 ? "" : "s"}
      </span>
      <span class="status-divider">|</span>
      <!-- Grid / Snap toggles + size picker -->
      <span class="status-segment">
        <button
          class="status-toggle {showGrid ? 'on' : 'off'}"
          onclick={() => (showGrid = !showGrid)}
          title="Toggle Grid (Ctrl+;)">Grid</button
        >
        <button
          class="status-toggle {snapToGrid ? 'on' : 'off'}"
          onclick={() => (snapToGrid = !snapToGrid)}
          title="Toggle Snap (Ctrl+Shift+G)">Snap</button
        >
        {#if showGrid}
          <select
            class="grid-size-select"
            value={gridSizeKey}
            onchange={(e) => {
              const v = e.currentTarget.value;
              gridSizeKey =
                v === "custom" ? "custom" : (+v as typeof gridSizeKey);
            }}
            title="Grid size"
          >
            {#each GRID_PRESETS as p}
              <option value={p}>{p}px</option>
            {/each}
            <option value="custom">Custom…</option>
          </select>
          {#if gridSizeKey === "custom"}
            <input
              type="number"
              class="grid-custom-input"
              min="1"
              max="500"
              step="1"
              value={gridSizeCustom}
              oninput={(e) =>
                (gridSizeCustom = Math.max(1, +e.currentTarget.value || 20))}
              title="Custom grid size (px)"
            />
          {/if}
        {/if}
      </span>
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

    {#if showRecoveryDialog}
      <!-- Recovery Dialog Overlay -->
      <div
        style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 5000;"
      >
        <div
          style="background: #2c2c2c; padding: 25px; border-radius: 8px; width: 350px; color: white; border: 1px solid #444; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"
        >
          <h3 style="margin-top: 0; color: #ffeb3b;">Recover Unsaved Work?</h3>
          <p style="color: #ccc; font-size: 14px; line-height: 1.5;">
            It looks like SciFigura was closed unexpectedly. We found an auto-saved recovery file. Would you like to restore it?
          </p>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            <button
              onclick={() => handleRecover(false)}
              style="padding: 8px 16px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer;"
            >
              Discard
            </button>
            <button
              onclick={() => handleRecover(true)}
              style="padding: 8px 16px; background: #2196F3; border: none; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;"
            >
              Yes, Restore
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if showExportDialog}
      <!-- Export Dialog Overlay -->
      <div
        style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000;"
      >
        <div
          style="background: #2c2c2c; padding: 20px; border-radius: 8px; width: 300px; color: white; border: 1px solid #444; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"
        >
          <h3 style="margin-top: 0;">Export Figure</h3>

          <div style="margin-bottom: 15px;">
            <label
              for="export-format"
              style="display: block; margin-bottom: 5px; color: #ccc;"
              >Format</label
            >
            <select
              id="export-format"
              bind:value={exportConfig.format}
              style="width: 100%; padding: 5px; background: #444; color: white; border: 1px solid #555; border-radius: 4px;"
            >
              <option value="png">PNG (Raster)</option>
              <option value="tiff">TIFF (Raster)</option>
              <option value="svg">SVG (Vector)</option>
              <option value="pdf">PDF (Vector)</option>
            </select>
          </div>

          <div style="margin-bottom: 15px;">
            <label
              for="export-dpi"
              style="display: block; margin-bottom: 5px; color: #ccc;"
              >Resolution (DPI)</label
            >
            <select
              id="export-dpi"
              bind:value={exportConfig.dpi}
              disabled={exportConfig.format === "svg"}
              style="width: 100%; padding: 5px; background: #444; color: white; border: 1px solid #555; border-radius: 4px; opacity: {exportConfig.format ===
              'svg'
                ? 0.5
                : 1};"
            >
              <option value={72}>72 DPI (Screen)</option>
              <option value={300}>300 DPI (Print)</option>
              <option value={600}>600 DPI (High Res)</option>
            </select>
            {#if exportConfig.format === "svg"}
              <div style="font-size: 11px; color: #888; margin-top: 5px;">
                Resolution irrelevant for vector export
              </div>
            {/if}
            {#if exportConfig.format === "pdf"}
              <div style="font-size: 11px; color: #888; margin-top: 5px;">
                Controls resolution of embedded raster images
              </div>
            {/if}
          </div>

          <div
            style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;"
          >
            <button
              onclick={() => (showExportDialog = false)}
              style="padding: 6px 12px; background: transparent; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer;"
            >
              Cancel
            </button>
            <button
              onclick={handleExport}
              disabled={isExporting}
              style="padding: 6px 12px; background: #2196F3; border: none; color: white; border-radius: 4px; cursor: pointer;"
            >
              {isExporting ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if showShortcutsHelp}
      <!-- Keyboard Shortcuts Overlay -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
      <div
        style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 3000;"
        onclick={() => (showShortcutsHelp = false)}
        role="button"
        tabindex="-1"
      >
        <div
          style="background: #1e1e1e; padding: 24px 28px; border-radius: 10px; width: 580px; max-height: 85vh; overflow-y: auto; color: #e0e0e0; border: 1px solid #3a3a3a; box-shadow: 0 12px 40px rgba(0,0,0,0.8);"
          onclick={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #333; padding-bottom: 12px;"
          >
            <h2 style="margin: 0; font-size: 15px; color: #fff;">
              &#9000;&#65039; Keyboard Shortcuts
            </h2>
            <button
              onclick={() => (showShortcutsHelp = false)}
              style="background: transparent; border: none; color: #666; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;"
              >&times;</button
            >
          </div>
          <div
            style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px;"
          >
            <div>
              <p
                style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin:0 0 8px 0;"
              >
                Tools
              </p>
              <table
                style="width:100%;border-collapse:collapse;font-size:13px;"
              >
                <tbody>
                  <tr
                    ><td style="padding:3px 0;width:90px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >V</kbd
                      ></td
                    ><td style="color:#aaa;">Select</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >R</kbd
                      ></td
                    ><td style="color:#aaa;">Rectangle</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >E</kbd
                      ></td
                    ><td style="color:#aaa;">Ellipse</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >W</kbd
                      ></td
                    ><td style="color:#aaa;">Arc / Pie</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >L</kbd
                      ></td
                    ><td style="color:#aaa;">Line</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >P</kbd
                      ></td
                    ><td style="color:#aaa;">Pen Tool</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >A</kbd
                      ></td
                    ><td style="color:#aaa;">Node Tool</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >T</kbd
                      ></td
                    ><td style="color:#aaa;">Text</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >P</kbd
                      ></td
                    ><td style="color:#aaa;">Pan (hold)</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >S</kbd
                      ></td
                    ><td style="color:#aaa;">Scale Bar</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >H</kbd
                      ></td
                    ><td style="color:#aaa;">Label</td></tr
                  >
                </tbody>
              </table>
              <p
                style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin:16px 0 8px 0;"
              >
                Selection
              </p>
              <table
                style="width:100%;border-collapse:collapse;font-size:13px;"
              >
                <tbody>
                  <tr
                    ><td style="padding:3px 0;width:150px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+A</kbd
                      ></td
                    ><td style="color:#aaa;">Select all</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Shift+A</kbd
                      ></td
                    ><td style="color:#aaa;">Select same type</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Escape</kbd
                      ></td
                    ><td style="color:#aaa;">Deselect / close</td></tr
                  >
                </tbody>
              </table>
              <p
                style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin:16px 0 8px 0;"
              >
                View
              </p>
              <table
                style="width:100%;border-collapse:collapse;font-size:13px;"
              >
                <tbody>
                  <tr
                    ><td style="padding:3px 0;width:150px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+G</kbd
                      ></td
                    ><td style="color:#aaa;">Group selected</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Shift+G</kbd
                      ></td
                    ><td style="color:#aaa;">Ungroup selected</td></tr
                  >
                  <tr
                    ><td style="padding:3px 0;width:150px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+;</kbd
                      ></td
                    ><td style="color:#aaa;">Toggle grid</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Shift+;</kbd
                      ></td
                    ><td style="color:#aaa;">Toggle snap</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >?</kbd
                      ></td
                    ><td style="color:#aaa;">Shortcut cheatsheet</td></tr
                  >
                </tbody>
              </table>
            </div>
            <div>
              <p
                style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin:0 0 8px 0;"
              >
                Edit
              </p>
              <table
                style="width:100%;border-collapse:collapse;font-size:13px;"
              >
                <tbody>
                  <tr
                    ><td style="padding:3px 0;width:155px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Z</kbd
                      ></td
                    ><td style="color:#aaa;">Undo</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Shift+Z</kbd
                      ></td
                    ><td style="color:#aaa;">Redo</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+C</kbd
                      ></td
                    ><td style="color:#aaa;">Copy</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+X</kbd
                      ></td
                    ><td style="color:#aaa;">Cut</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+V</kbd
                      ></td
                    ><td style="color:#aaa;">Paste</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+D</kbd
                      ></td
                    ><td style="color:#aaa;">Duplicate</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Del / Bksp</kbd
                      ></td
                    ><td style="color:#aaa;">Delete selected</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Arrows</kbd
                      ></td
                    ><td style="color:#aaa;">Nudge 1 px</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Shift+Arrow</kbd
                      ></td
                    ><td style="color:#aaa;">Nudge 10 px</td></tr
                  >
                </tbody>
              </table>
              <p
                style="font-size:11px;text-transform:uppercase;color:#555;font-weight:600;margin:16px 0 8px 0;"
              >
                File
              </p>
              <table
                style="width:100%;border-collapse:collapse;font-size:13px;"
              >
                <tbody>
                  <tr
                    ><td style="padding:3px 0;width:155px;"
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+N</kbd
                      ></td
                    ><td style="color:#aaa;">New canvas</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+O</kbd
                      ></td
                    ><td style="color:#aaa;">Import image</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+S</kbd
                      ></td
                    ><td style="color:#aaa;">Save project</td></tr
                  >
                  <tr
                    ><td
                      ><kbd
                        style="background:#2a2a2a;color:#ddd;padding:1px 7px;border-radius:3px;font-family:monospace;font-size:12px;border:1px solid #444;"
                        >Ctrl+Shift+E</kbd
                      ></td
                    ><td style="color:#aaa;">Export figure</td></tr
                  >
                </tbody>
              </table>
            </div>
          </div>
          <p
            style="font-size:11px;color:#444;margin:18px 0 0 0;text-align:center;border-top:1px solid #2a2a2a;padding-top:10px;"
          >
            Press <kbd
              style="background:#2a2a2a;color:#ddd;padding:1px 5px;border-radius:3px;font-size:11px;border:1px solid #444;"
              >?</kbd
            >
            or
            <kbd
              style="background:#2a2a2a;color:#ddd;padding:1px 5px;border-radius:3px;font-size:11px;border:1px solid #444;"
              >Esc</kbd
            > to close
          </p>
        </div>
      </div>
    {/if}

    <!-- Status Bar with Zoom Controls -->
    <!-- REMOVED FLOATING STATUS BAR -->
  </div>

  {#if isDragOver}
    <div
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(33, 150, 243, 0.2); border: 4px dashed #2196F3; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 1000;"
    >
      <div
        style="background: #2196F3; color: white; padding: 20px 40px; border-radius: 8px; font-weight: bold; font-size: 24px;"
      >
        Drop Image to Import
      </div>
    </div>
  {/if}

  <!-- Right Sidebar: Layers -->
  <LayersPanel
    {objects}
    {selectedIds}
    updateObject={updateObjectProperty}
    {reorderObjects}
    {toggleSelection}
  />

  <!-- Right Sidebar: Properties -->
  <PropertiesPanel
    selection={selectedObjects}
    updateObject={updateObjectProperty}
    bind:globalTheme
    {applyStyleToSelected}
    {applyFontToSelected}
    {applyStyleToAllScaleBars}
    {applyThemeToAll}
    {resetLabelSequence}
  />

  <ValidationPanel issues={validationIssues} onSelect={handleValidationSelect} />
</div>

<style>
  .app-layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #1e1e1e; /* Dark theme background */
  }

  .canvas-area {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #333; /* Canvas background */
  }

  .top-bar {
    height: 40px;
    background: #2c2c2c;
    border-bottom: 1px solid #1a1a1a;
    display: flex;
    align-items: center;
    padding: 0 10px;
    gap: 10px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 5;
  }

  .menu-group {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .divider-v {
    width: 1px;
    height: 20px;
    background: #444;
  }

  .top-bar button {
    background: transparent;
    border: 1px solid transparent;
    color: #bbb;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
    display: flex;
    align-items: center;
    gap: 5px;
    line-height: 1;
  }

  .top-bar button:hover {
    background: #3a3a3a;
    color: #eee;
    border-color: #555;
  }

  /* Icon + text button */
  .top-bar .icon-text-btn {
    padding: 4px 9px;
  }

  /* Icon-only button */
  .top-bar .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    justify-content: center;
  }

  /* Export button gets a subtle blue tint */
  .top-bar .export-btn {
    color: #5aabff;
  }
  .top-bar .export-btn:hover {
    background: rgba(90, 171, 255, 0.12);
    color: #7fc0ff;
    border-color: rgba(90, 171, 255, 0.3);
  }

  /* Font warnings toast (shown after journal reformat) */
  .font-warnings-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 8000;
    background: #2a1a0a;
    border: 1px solid #8a4a00;
    border-radius: 10px;
    padding: 14px 18px;
    color: #f0b060;
    font-size: 12px;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }
  .font-warnings-toast ul {
    margin: 6px 0 10px 14px;
    padding: 0;
    font-size: 11px;
    color: #d09050;
  }
  .font-warnings-toast button {
    background: #3a2a0a;
    border: 1px solid #6a3a00;
    color: #f0b060;
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .font-warnings-toast button:hover {
    background: #4a3a0a;
  }

  /* Paper size picker */
  .paper-select {
    background: transparent;
    border: none;
    color: #888;
    font-size: 11px;
    cursor: pointer;
    outline: none;
    max-width: 140px;
  }
  .paper-select:hover {
    color: #ccc;
  }
  .paper-dims {
    font-size: 10px;
    color: #3a3a3a;
    font-family: monospace;
    white-space: nowrap;
  }
  .paper-custom {
    width: 52px;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #888;
    font-size: 10px;
    border-radius: 3px;
    padding: 2px 4px;
    text-align: right;
  }

  /* Layout presets active state */
  .top-bar .layout-active {
    background: #2a2a3a;
    border-color: #3a4a6a;
    color: #7a9aff;
  }

  /* Alignment toolbar */
  .align-group {
    gap: 1px;
  }

  .top-bar .btn-disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  /* Canvas element flex grow to fill space below top bar */
  canvas {
    flex: 1;
  }

  .status-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: #252525;
    color: #777;
    padding: 0 10px;
    font-family: monospace;
    font-size: 10px;
    user-select: none;
    z-index: 100;
    border-top: 1px solid #1a1a1a;
    display: flex;
    align-items: center;
    gap: 0;
    height: 22px;
  }

  .status-segment {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    white-space: nowrap;
  }

  .status-label {
    color: #444;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
    margin-right: 2px;
  }

  .status-divider {
    color: #333;
    font-size: 12px;
    flex-shrink: 0;
  }

  /* Clickable grid/snap toggles in status bar */
  .status-toggle {
    background: transparent;
    border: 1px solid transparent;
    font-family: monospace;
    font-size: 10px;
    cursor: pointer;
    padding: 1px 5px;
    border-radius: 3px;
    transition: all 0.1s;
  }
  .status-toggle.on {
    color: #5aabff;
    border-color: #2a4a70;
  }
  .status-toggle.off {
    color: #444;
    border-color: transparent;
  }
  .status-toggle:hover {
    background: #333;
    color: #aaa;
  }

  /* Grid size select in status bar */
  .grid-size-select {
    background: transparent;
    border: none;
    color: #444;
    font-size: 10px;
    cursor: pointer;
    outline: none;
    padding: 0 2px;
  }
  .grid-size-select:hover {
    color: #aaa;
  }
  .grid-size-select option {
    background: #2a2a2a;
    color: #ccc;
  }

  .grid-custom-input {
    width: 38px;
    background: #2a2a2a;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    border-radius: 2px;
    padding: 1px 3px;
    text-align: right;
  }

  /* Context Menu */
  .ctx-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
  }

  .ctx-menu {
    position: fixed;
    z-index: 10001;
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 4px 0;
    min-width: 180px;
    color: #ccc;
    font-size: 12px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .ctx-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: #ccc;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .ctx-item:hover {
    background: #094771;
    color: #fff;
  }

  .ctx-key {
    color: #888;
    font-size: 11px;
    margin-left: 12px;
  }

  .ctx-item:hover .ctx-key {
    color: #ccc;
  }

  .ctx-sep {
    height: 1px;
    background: #3e3e42;
    margin: 4px 0;
  }

  .ctx-danger {
    color: #d64937;
  }
  .ctx-danger:hover {
    background: #d64937;
    color: #fff;
  }
</style>
