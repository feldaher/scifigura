import { BaseDirectory, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import type { LayoutPreset, PanelRect } from '../types';

const G = 0.02; // gutter (2% of canvas width/height)

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    key: "1x1",
    label: "1 × 1",
    description: "Single full panel",
    panels: [{ x: G, y: G, w: 1 - 2 * G, h: 1 - 2 * G }],
  },
  {
    key: "1x2",
    label: "1 × 2",
    description: "Two columns",
    panels: [
      { x: G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
      { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
    ],
  },
  {
    key: "2x1",
    label: "2 × 1",
    description: "Two rows",
    panels: [
      { x: G, y: G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
    ],
  },
  {
    key: "2x2",
    label: "2 × 2",
    description: "Four equal panels",
    panels: [
      { x: G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
    ],
  },
  {
    key: "1+2",
    label: "1 + 2",
    description: "Wide top, two columns below",
    panels: [
      { x: G, y: G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
    ],
  },
  {
    key: "2+1",
    label: "2 + 1",
    description: "Two columns above, wide below",
    panels: [
      { x: G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
    ],
  },
  {
    key: "1x3",
    label: "1 × 3",
    description: "Three columns",
    panels: (() => {
      const w = (1 - 4 * G) / 3;
      return [0, 1, 2].map((i) => ({ x: G + i * (w + G), y: G, w, h: 1 - 2 * G }));
    })(),
  },
  {
    key: "3x1",
    label: "3 × 1",
    description: "Three rows",
    panels: (() => {
      const h = (1 - 4 * G) / 3;
      return [0, 1, 2].map((i) => ({ x: G, y: G + i * (h + G), w: 1 - 2 * G, h }));
    })(),
  },
  {
    key: "3x2",
    label: "3 × 2",
    description: "Three columns, two rows",
    panels: (() => {
      const cw = (1 - 4 * G) / 3;
      const ch = (1 - 3 * G) / 2;
      const ps: PanelRect[] = [];
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 3; col++)
          ps.push({ x: G + col * (cw + G), y: G + row * (ch + G), w: cw, h: ch });
      return ps;
    })(),
  },
  {
    key: "2x3",
    label: "2 × 3",
    description: "Two columns, three rows",
    panels: (() => {
      const cw = (1 - 3 * G) / 2;
      const ch = (1 - 4 * G) / 3;
      const ps: PanelRect[] = [];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 2; col++)
          ps.push({ x: G + col * (cw + G), y: G + row * (ch + G), w: cw, h: ch });
      return ps;
    })(),
  },
  {
    key: "3x3",
    label: "3 × 3",
    description: "Three columns, three rows",
    panels: (() => {
      const w = (1 - 4 * G) / 3;
      const ps: PanelRect[] = [];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
          ps.push({ x: G + col * (w + G), y: G + row * (w + G), w, h: w });
      return ps;
    })(),
  },
  {
    key: "1L+2R",
    label: "1L + 2R",
    description: "Wide left, two stacked right",
    panels: [
      { x: G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
      { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
    ],
  },
  {
    key: "2L+1R",
    label: "2L + 1R",
    description: "Two stacked left, wide right",
    panels: [
      { x: G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
      { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
    ],
  },
  {
    key: "1T+3B",
    label: "1T + 3B",
    description: "Wide top, three bottom",
    panels: [
      { x: G, y: G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
      ...[0, 1, 2].map((i) => ({
        x: G + i * ((1 - 4 * G) / 3 + G),
        y: G + (1 - 3 * G) / 2 + G,
        w: (1 - 4 * G) / 3,
        h: (1 - 3 * G) / 2,
      })),
    ],
  },
  {
    key: "3T+1B",
    label: "3T + 1B",
    description: "Three top, wide bottom",
    panels: [
      ...[0, 1, 2].map((i) => ({
        x: G + i * ((1 - 4 * G) / 3 + G),
        y: G,
        w: (1 - 4 * G) / 3,
        h: (1 - 3 * G) / 2,
      })),
      { x: G, y: G + (1 - 3 * G) / 2 + G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
    ],
  },
];
export interface CustomPreset {
  key: string;
  label: string;
  w: number;
  h: number;
  minFontSizePt?: number;
}

const PRESETS_FILE = 'custom_journals.json';

/**
 * Loads custom journal presets from the user's AppData directory.
 */
export async function loadCustomPresets(): Promise<CustomPreset[]> {
  try {
    const contents = await readTextFile(PRESETS_FILE, { baseDir: BaseDirectory.AppData });
    if (!contents.trim()) return [];
    
    const parsed = JSON.parse(contents);
    if (Array.isArray(parsed)) {
      return parsed as CustomPreset[];
    }
    return [];
  } catch (err: any) {
    // If file doesn't exist, it's fine, we just return empty array
    if (err.includes?.('No such file or directory') || err.message?.includes('No such file')) {
      return [];
    }
    console.error("Failed to load custom presets:", err);
    return [];
  }
}

/**
 * Saves custom journal presets to the user's AppData directory.
 * Will recursively create the AppData directory if it doesn't exist.
 */
export async function saveCustomPresets(presets: CustomPreset[]): Promise<void> {
  try {
    // Ensure the AppData directory exists
    try {
      await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true });
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.includes?.('exists') && !e.message?.includes('exists')) {
        console.warn('Failed to Mkdir AppData:', e);
      }
    }

    const json = JSON.stringify(presets, null, 2);
    await writeTextFile(PRESETS_FILE, json, { baseDir: BaseDirectory.AppData });
  } catch (err) {
    console.error("Failed to save custom presets:", err);
    throw err;
  }
}
