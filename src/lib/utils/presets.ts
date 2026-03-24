import { BaseDirectory, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';

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
