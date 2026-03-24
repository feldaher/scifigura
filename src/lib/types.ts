export interface CanvasObject {
  id: string;
  type: "rectangle" | "ellipse" | "line" | "text" | "group" | "label" | "scalebar" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Layer system properties
  name?: string;
  locked?: boolean;
  hidden?: boolean;

  // For groups
  children?: CanvasObject[];

  // For lines / arrows
  x2?: number;
  y2?: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  arrowheadStyle?: "filled" | "open" | "diamond" | "circle" | "bar";
  arrowFillColor?: string; // Arrowhead fill color (defaults to stroke color)

  // For text & labels
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  
  // For labels
  autoIncrement?: boolean;
  labelStyle?: "uppercase" | "lowercase" | "number";
  parentheses?: "none" | "()" | ")";

  // For scalebars and labels
  physicalLength?: number;
  units?: string;
  pixelSize?: number;
  labelPosition?: string; // "above" | "below" | "none" for scalebar, or "top-left" for layout
  backgroundColor?: string;
  backgroundOpacity?: number;
  presetPosition?: string;
  parentId?: string; // ID of the linked image
  offsetX?: number;  // Relative to parent image
  offsetY?: number;  // Relative to parent image

  // For images
  src?: string;
  originalPath?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  // Non-destructive crop insets (pixels into the source image)
  cropLeft?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  // Image adjustments (applied via canvas filter)
  brightness?: number; // 0–200, default 100
  contrast?: number;   // 0–200, default 100

  fill: string;
  stroke?: string;
  strokeWidth?: number;
  lineDash?: number[]; // For dashed lines: [] = solid, [5,5] = dashed, etc.

  // Transformations
  rotation?: number; // In radians
}

export type InteractionMode =
  | "pan"
  | "select"
  | "move"
  | "resize"
  | "marquee"
  | "draw_rectangle"
  | "draw_ellipse"
  | "draw_line"
  | "draw_text"
  | "draw_label"
  | "draw_scalebar"
  | "rotate";

export interface ValidationIssue {
  id: string;
  objectId: string;
  type: "error" | "warning";
  message: string;
}
