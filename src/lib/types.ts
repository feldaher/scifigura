export interface PathNode {
  id: string;
  x: number;
  y: number;
  // Control points for cubic curves (in absolute canvas coordinates)
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
  type: "smooth" | "corner" | "asymmetric";
}

export interface CanvasObject {
  id: string;
  type: "rectangle" | "ellipse" | "arc" | "line" | "text" | "group" | "label" | "scalebar" | "image" | "path";
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

  // For paths
  pathNodes?: PathNode[];
  closed?: boolean;

  // For arcs/pies
  startAngle?: number;  // radians (default 0)
  endAngle?: number;    // radians (default 2*Math.PI)
  arcClosed?: "pie" | "chord" | "open"; // how endpoints connect

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
  | "draw_arc"
  | "draw_line"
  | "draw_text"
  | "draw_label"
  | "draw_scalebar"
  | "draw_path"
  | "edit_nodes"
  | "rotate";

export interface ValidationIssue {
  id: string;
  objectId: string;
  type: "error" | "warning";
  message: string;
}
