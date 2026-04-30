---
layout: default
title: Quickstart
---

# SciFigura Quick-Start Guide
> **SciFigura** is a free, open-source desktop app for creating publication-ready scientific figures. This guide walks you through building a complete 4-panel figure from scratch.

---

## Installation

Download the latest installer for your platform from the [Releases page](https://github.com/feldaher/scifigura/releases):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `SciFigura_x.x.x_aarch64.dmg` |
| macOS (Intel) | `SciFigura_x.x.x_x64.dmg` |
| Windows | `SciFigura_x.x.x_x64-setup.exe` |
| Linux | `SciFigura_x.x.x_amd64.AppImage` |

Open the installer, drag SciFigura to your Applications folder (macOS), and launch it.

---

## Step 1 — Choose your journal preset

When SciFigura opens, the canvas defaults to **A4 Landscape**. Click the **Journal Preset** dropdown in the top toolbar to select your target journal (e.g. *Nature 2-col*, *Cell full page*, *PNAS*).

This sets the canvas dimensions and the minimum font size requirement that the **Validation Panel** will enforce automatically.

> 💡 You can also create **Custom Presets** via the ⚙️ icon next to the dropdown — enter your journal's exact column widths and minimum font sizes, and SciFigura will remember them.

---

## Step 2 — Set up a multi-panel layout

Click the **Layout** button in the top bar (grid icon) to open the Layout Presets panel. Choose a preset such as **2×2 grid** for a 4-panel figure.

SciFigura will draw 4 evenly-spaced panel rectangles across the canvas. Each panel contains a label placeholder.

To customise spacing:
- Drag any panel rectangle to reposition it
- Use **Object → Align** (or the alignment icons in the Properties Panel) to distribute panels evenly

---

## Step 3 — Import your images

Select a panel rectangle, then press **⌘I** (macOS) / **Ctrl+I** (Windows/Linux) to import an image, or drag image files directly onto the canvas.

Supported formats: PNG, JPEG, TIFF, WebP, SVG, PDF.

The imported image will fill the selected panel area. Use the resize handles to fit it precisely.

> ⚠️ The **Validation Panel** (bottom-left) will warn you if an image has been scaled up so much that its effective resolution drops below **300 DPI**. Scale down or use a higher-resolution source image to fix it.

---

## Step 4 — Add scale bars

Select an image on the canvas, then click **Scalebar** (`S` shortcut) from the toolbox.

A dialog will appear asking for:
- **Physical length** — the real-world size you want the scale bar to represent (e.g. `10`)
- **Pixel size** — how many nanometres/microns per pixel (from your microscope metadata)
- **Units** — e.g. `µm`, `nm`

Click **Confirm**. SciFigura calculates the pixel width automatically and places a scale bar in the bottom-right corner of the image. The scale bar will follow the image if you move it.

---

## Step 5 — Add panel labels

Select the **Label Tool** (`H` shortcut) from the toolbox. Click anywhere on the canvas to place a label. Labels auto-increment alphabetically (**A**, **B**, **C**, **D**…).

To reset the sequence back to **A**, click **Reset Labels** in the toolbar.

To edit label appearance, select a label and adjust:
- **Font size**, **weight**, and **family** in the Properties Panel (right sidebar)
- **Fill colour** for the text

> ⚠️ If your selected journal preset requires a minimum font size (e.g. 5 pt for *Nature*), the Validation Panel will highlight any labels that are too small.

---

## Step 6 — Annotate with shapes and arrows

Use the drawing tools in the left toolbox:

| Key | Tool |
|---|---|
| `R` | Rectangle |
| `E` | Ellipse |
| `L` | Line / Arrow |
| `T` | Text box |

For arrows, draw a line and toggle **Arrow End** / **Arrow Start** in the Properties Panel. You can choose from filled, open, diamond, circle, or bar arrowhead styles.

---

## Step 7 — Validate your figure

The **Validation Panel** (bottom-left corner) runs continuously and shows:

| Icon | Meaning |
|---|---|
| ✅ | All checks pass |
| ⚠️ Warning | Something to review (e.g. image DPI or object outside margins) |
| ❌ Error | Must fix (e.g. font size below journal minimum) |

**Click any warning or error** to instantly jump to and select the offending object on the canvas.

---

## Step 8 — Export your figure

Press **⌘S** (macOS) / **Ctrl+S** (Windows/Linux) to export. This opens the Export dialog:

| Format | Best for |
|---|---|
| **PNG** | Presentations, web |
| **TIFF** | Journal submission (set 300 or 600 DPI) |
| **SVG** | Fully scalable vector — ideal for editing in Inkscape/Illustrator |
| **PDF** | Journal submission with vector shapes + embedded images |

Choose **300 DPI** or **600 DPI** for all journal submissions.

> 💡 SciFigura auto-saves a recovery file every 60 seconds. If the app crashes, you'll be offered the option to restore your work on next launch.

---

## Keyboard Shortcuts Reference

| Key | Action |
|---|---|
| `V` | Select tool |
| `R` | Rectangle |
| `E` | Ellipse |
| `L` | Line |
| `T` | Text |
| `H` | Panel label |
| `S` | Scale bar |
| `P` | Pan |
| `Space` + drag | Pan (temporary) |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Y` | Redo |
| `⌘S` / `Ctrl+S` | Export |
| `⌘⇧S` / `Ctrl+Shift+S` | Save project (.json) |
| `⌘I` / `Ctrl+I` | Import image |
| `Delete` | Delete selected |
| `?` | Show all shortcuts |

---

## Saving and Loading Projects

SciFigura saves your canvas as a **JSON project file** (not a flattened image), preserving all objects, layers, and settings so you can come back and edit later.

- **Save:** `⌘⇧S` / `Ctrl+Shift+S` → choose a `.json` file path
- **Open:** `⌘O` / `Ctrl+O` → select a previously saved `.json` file

---

## Getting Help

- 🐛 Found a bug? [Open an issue](https://github.com/feldaher/scifigura/issues)
- 💬 Questions? Start a [Discussion](https://github.com/feldaher/scifigura/discussions)
- 📖 [Full documentation](https://github.com/feldaher/scifigura/wiki) (coming soon)
