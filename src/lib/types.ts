export interface CanvasObject {
  id: string;
  type: "rectangle" | "ellipse" | "line" | "text" | "group" | "label" | "scalebar" | "image";
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

  // For scalebars
  physicalLength?: number;
  units?: string;
  showText?: boolean;

  // For images
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;

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
