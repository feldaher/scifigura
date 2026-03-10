<script lang="ts">
  import type { CanvasObject } from "../types";

  let {
    selection = [],
    updateObject,

    // Global Defaults (Bindings)
    defaultFillColor = $bindable(),
    defaultStrokeColor = $bindable(),
    defaultStrokeWidth = $bindable(),
    defaultLineDash = $bindable(),

    defaultFontFamily = $bindable(),
    defaultFontSize = $bindable(),
    defaultFontWeight = $bindable(),
    defaultFontStyle = $bindable(),

    // Action Handlers
    applyStyleToSelected,
    applyFontToSelected,
    resetLabelSequence,
    onStyleChange,
  }: {
    selection: CanvasObject[];
    updateObject: (
      id: string,
      props: Partial<CanvasObject>,
      save?: boolean,
    ) => void;

    defaultFillColor: string;
    defaultStrokeColor: string;
    defaultStrokeWidth: number;
    defaultLineDash: number[];

    defaultFontFamily: string;
    defaultFontSize: number;
    defaultFontWeight: "normal" | "bold";
    defaultFontStyle: "normal" | "italic";

    applyStyleToSelected: (prop: any, val: any) => void;
    applyFontToSelected: (prop: any, val: any) => void;
    resetLabelSequence?: () => void;

    // Optional callback for tracking style changes (for tool persistence)
    onStyleChange?: (prop: string, val: any) => void;
  } = $props();

  // Helper to safely get value from selection or default
  function getValue(key: keyof CanvasObject, def: any = 0) {
    if (selection.length !== 1) return def;
    const val = selection[0][key];
    return val !== undefined ? val : def;
  }

  // Derived state for geometry
  let x = $derived(Math.round(getValue("x")));
  let y = $derived(Math.round(getValue("y")));
  let w = $derived(Math.round(getValue("width")));
  let h = $derived(Math.round(getValue("height")));
  let rotationDeg = $derived(
    Math.round(((getValue("rotation", 0) as number) * 180) / Math.PI),
  );
  let x2 = $derived(Math.round(getValue("x2")));
  let y2 = $derived(Math.round(getValue("y2")));

  // Helpers
  function update(prop: keyof CanvasObject, value: number) {
    if (selection.length !== 1) return;
    updateObject(selection[0].id, { [prop]: value });
  }

  function updateRotation(deg: number) {
    if (selection.length !== 1) return;
    updateObject(selection[0].id, { rotation: (deg * Math.PI) / 180 });
  }

  // Dash array to string helper
  function getDashString(dash: number[] | undefined): string {
    if (!dash || dash.length === 0) return "solid";
    if (dash.length === 2 && dash[0] === 5 && dash[1] === 5) return "dashed";
    if (dash.length === 2 && dash[0] === 2 && dash[1] === 3) return "dotted";
    return "dashdot"; // rough approx
  }
</script>

<aside class="properties-panel">
  <!-- Header / Context Title -->
  <header>
    <div class="header-row">
      {#if selection.length === 0}
        <span class="header-title">Canvas</span>
        {#if resetLabelSequence}
          <button
            class="reset-btn"
            onclick={resetLabelSequence}
            title="Reset Label Counter to A"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset Labels
          </button>
        {/if}
      {:else if selection.length === 1}
        <span class="header-title"
          >{selection[0].type.charAt(0).toUpperCase() +
            selection[0].type.slice(1)}</span
        >
      {:else}
        <span class="header-title">{selection.length} Selected</span>
      {/if}
    </div>
  </header>

  <div class="content">
    <!-- 1. Geometry (Only for single selection) -->
    {#if selection.length === 1}
      {@const obj = selection[0]}
      <div class="section">
        <h4>Transform</h4>
        <div class="grid-2">
          <label
            ><span>X</span><input
              type="number"
              value={x}
              oninput={(e) => update("x", +e.currentTarget.value)}
            /></label
          >
          <label
            ><span>Y</span><input
              type="number"
              value={y}
              oninput={(e) => update("y", +e.currentTarget.value)}
            /></label
          >

          {#if obj.type === "line"}
            <label
              ><span>X2</span><input
                type="number"
                value={x2}
                oninput={(e) => update("x2", +e.currentTarget.value)}
              /></label
            >
            <label
              ><span>Y2</span><input
                type="number"
                value={y2}
                oninput={(e) => update("y2", +e.currentTarget.value)}
              /></label
            >
          {/if}

          <label
            ><span>W</span><input
              type="number"
              value={w}
              oninput={(e) => update("width", +e.currentTarget.value)}
            /></label
          >
          <label
            ><span>H</span><input
              type="number"
              value={h}
              oninput={(e) => update("height", +e.currentTarget.value)}
            /></label
          >

          <label class="full-width"
            ><span>R</span>
            <div class="unit-input">
              <input
                type="number"
                value={rotationDeg}
                oninput={(e) => updateRotation(+e.currentTarget.value)}
              />
              <span class="unit">°</span>
            </div>
          </label>
        </div>
      </div>
    {/if}

    <!-- 2. Appearance (Fill & Stroke) -->
    <!-- Shown for Empty (Defaults) OR Selection (except pure text, but Labels have fill) -->
    {#if selection.length <= 1 || selection.every((o) => o.type !== "text")}
      <div class="section">
        <h4>Appearance</h4>

        <!-- Fill -->
        <div class="row items-center">
          <div class="color-swatch-wrapper">
            <input
              type="color"
              value={defaultFillColor}
              oninput={(e) => {
                defaultFillColor = e.currentTarget.value;
                if (selection.length > 0) {
                  applyStyleToSelected("fill", defaultFillColor);
                  onStyleChange?.("fill", defaultFillColor);
                }
              }}
            />
          </div>
          <span class="label">Fill</span>
          <input
            class="hex-input"
            type="text"
            value={defaultFillColor}
            oninput={(e) => {
              defaultFillColor = e.currentTarget.value;
              if (selection.length > 0) {
                applyStyleToSelected("fill", defaultFillColor);
                onStyleChange?.("fill", defaultFillColor);
              }
            }}
          />
        </div>

        <!-- Stroke -->
        <div class="row items-center mt-2">
          <div class="color-swatch-wrapper">
            <input
              type="color"
              value={defaultStrokeColor}
              oninput={(e) => {
                defaultStrokeColor = e.currentTarget.value;
                if (selection.length > 0) {
                  applyStyleToSelected("stroke", defaultStrokeColor);
                  onStyleChange?.("stroke", defaultStrokeColor);
                }
              }}
            />
          </div>
          <span class="label">Stroke</span>
          <input
            class="hex-input"
            type="text"
            value={defaultStrokeColor}
            oninput={(e) => {
              defaultStrokeColor = e.currentTarget.value;
              if (selection.length > 0) {
                applyStyleToSelected("stroke", defaultStrokeColor);
                onStyleChange?.("stroke", defaultStrokeColor);
              }
            }}
          />
        </div>

        <!-- Stroke Properties -->
        <div class="row gap-2 mt-2">
          <label class="flex-1">
            <span>Width</span>
            <select
              bind:value={defaultStrokeWidth}
              onchange={() => {
                applyStyleToSelected("strokeWidth", defaultStrokeWidth);
                onStyleChange?.("strokeWidth", defaultStrokeWidth);
              }}
            >
              {#each [1, 2, 3, 4, 5, 8, 10] as width}
                <option value={width}>{width}px</option>
              {/each}
            </select>
          </label>
          <label class="flex-1">
            <span>Style</span>
            <select
              value={getDashString(defaultLineDash)}
              onchange={(e) => {
                const val = e.currentTarget.value;
                let dash: number[] = [];
                if (val === "dashed") dash = [5, 5];
                else if (val === "dotted") dash = [2, 3];
                else if (val === "dashdot") dash = [8, 3, 2, 3];
                defaultLineDash = dash;
                defaultLineDash = dash;
                applyStyleToSelected("lineDash", dash);
                onStyleChange?.("lineDash", dash);
              }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="dashdot">Dash-Dot</option>
            </select>
          </label>
        </div>
      </div>
    {/if}

    <!-- 3. Typography (If default or Text/Label selected) -->
    {#if selection.length === 0 || selection.some((o) => o.type === "text" || o.type === "label")}
      <div class="section">
        <h4>Typography</h4>
        <div class="col gap-2">
          <select
            bind:value={defaultFontFamily}
            onchange={() => {
              applyFontToSelected("fontFamily", defaultFontFamily);
              onStyleChange?.("fontFamily", defaultFontFamily);
            }}
          >
            <optgroup label="Sans-serif">
              <option value="Arial">Arial</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Helvetica Neue">Helvetica Neue</option>
              <option value="Calibri">Calibri</option>
              <option value="Gill Sans">Gill Sans</option>
              <option value="Verdana">Verdana</option>
              <option value="Tahoma">Tahoma</option>
              <option value="Myriad Pro">Myriad Pro</option>
            </optgroup>
            <optgroup label="Serif">
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
              <option value="Palatino">Palatino</option>
              <option value="Garamond">Garamond</option>
              <option value="Book Antiqua">Book Antiqua</option>
            </optgroup>
            <optgroup label="Monospace">
              <option value="Courier New">Courier New</option>
              <option value="Consolas">Consolas</option>
              <option value="Menlo">Menlo</option>
              <option value="Monaco">Monaco</option>
              <option value="Lucida Console">Lucida Console</option>
            </optgroup>
            <optgroup label="Scientific / Special">
              <option value="STIX Two Text">STIX Two Text</option>
              <option value="Computer Modern">Computer Modern</option>
              <option value="Latin Modern">Latin Modern</option>
              <option value="Symbol">Symbol</option>
            </optgroup>
          </select>

          <div class="row gap-2">
            <select
              class="flex-1"
              bind:value={defaultFontSize}
              onchange={() => {
                applyFontToSelected("fontSize", defaultFontSize);
                onStyleChange?.("fontSize", defaultFontSize);
              }}
            >
              {#each [8, 10, 11, 12, 14, 16, 18, 20, 24, 32, 48, 64, 72] as size}
                <option value={size}>{size}pt</option>
              {/each}
            </select>

            <div class="row gap-0 bg-dark rounded">
              <button
                class:active={defaultFontWeight === "bold"}
                onclick={() => {
                  defaultFontWeight =
                    defaultFontWeight === "bold" ? "normal" : "bold";
                  applyFontToSelected("fontWeight", defaultFontWeight);
                  onStyleChange?.("fontWeight", defaultFontWeight);
                }}
                title="Bold"
                class="icon-btn text-bold">B</button
              >
              <button
                class:active={defaultFontStyle === "italic"}
                onclick={() => {
                  defaultFontStyle =
                    defaultFontStyle === "italic" ? "normal" : "italic";
                  applyFontToSelected("fontStyle", defaultFontStyle);
                  onStyleChange?.("fontStyle", defaultFontStyle);
                }}
                title="Italic"
                class="icon-btn text-italic">I</button
              >
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- 4. Align / Distribute (Multi-selection) -->
    <!-- 5. Line/Arrow Settings -->
    {#if selection.length === 1 && selection[0].type === "line"}
      {@const obj = selection[0]}
      <div class="section">
        <h4>Arrowhead</h4>
        <div class="col gap-2">
          <!-- Start/End Toggles -->
          <div class="row gap-2">
            <label class="row items-center gap-1 flex-1">
              <input
                type="checkbox"
                checked={obj.arrowStart}
                onchange={(e) => {
                  updateObject(obj.id, { arrowStart: e.currentTarget.checked });
                  onStyleChange?.("arrowStart", e.currentTarget.checked);
                }}
              />
              <span>Start</span>
            </label>
            <label class="row items-center gap-1 flex-1">
              <input
                type="checkbox"
                checked={obj.arrowEnd}
                onchange={(e) => {
                  updateObject(obj.id, { arrowEnd: e.currentTarget.checked });
                  onStyleChange?.("arrowEnd", e.currentTarget.checked);
                }}
              />
              <span>End</span>
            </label>
          </div>

          <!-- Style Picker -->
          <label>
            <span>Style</span>
            <select
              value={obj.arrowheadStyle || "filled"}
              onchange={(e) => {
                updateObject(obj.id, {
                  arrowheadStyle: e.currentTarget.value as any,
                });
                onStyleChange?.("arrowheadStyle", e.currentTarget.value);
              }}
            >
              <option value="filled">Filled Triangle</option>
              <option value="open">Open Chevron</option>
              <option value="diamond">Diamond</option>
              <option value="circle">Circle</option>
              <option value="bar">Bar (Dimension)</option>
            </select>
          </label>

          <!-- Arrow Fill Color -->
          <div class="row items-center">
            <div class="color-swatch-wrapper">
              <input
                type="color"
                value={obj.arrowFillColor || obj.stroke || "#000000"}
                oninput={(e) => {
                  updateObject(obj.id, {
                    arrowFillColor: e.currentTarget.value,
                  });
                  onStyleChange?.("arrowFillColor", e.currentTarget.value);
                }}
              />
            </div>
            <span class="label">Arrow Fill</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- 6. Scale Bar Settings -->
    {#if selection.length === 1 && selection[0].type === "scalebar"}
      {@const obj = selection[0]}
      <div class="section">
        <h4>Scale Bar</h4>
        <div class="col gap-2">
          <label>
            <span>Physical Length</span>
            <div class="row gap-2">
              <input
                type="number"
                value={obj.physicalLength}
                oninput={(e) =>
                  update("physicalLength", +e.currentTarget.value)}
                class="flex-1"
              />
              <input
                type="text"
                value={obj.units}
                oninput={(e) => {
                  updateObject(obj.id, { units: e.currentTarget.value });
                  onStyleChange?.("units", e.currentTarget.value);
                }}
                class="flex-1"
                placeholder="units"
              />
            </div>
          </label>

          <label class="row items-center gap-2">
            <input
              type="checkbox"
              checked={obj.showText !== false}
              onchange={(e) => {
                updateObject(obj.id, { showText: e.currentTarget.checked });
                onStyleChange?.("showText", e.currentTarget.checked);
              }}
            />
            <span>Show Label</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- 6. Image Editing -->
    {#if selection.length === 1 && selection[0].type === "image"}
      {@const obj = selection[0]}
      <div class="section">
        <div class="header-row" style="margin-bottom: 10px;">
          <h4 style="margin: 0;">Image</h4>
          <button
            class="reset-btn"
            title="Reset brightness/contrast"
            onclick={() => {
              updateObject(obj.id, { brightness: 100, contrast: 100 });
              onStyleChange?.("brightness", 100);
            }}
          >
            Reset
          </button>
        </div>
        <div class="col gap-2">
          <label>
            <div class="row" style="justify-content: space-between;">
              <span>Brightness</span>
              <span>{Math.round(obj.brightness ?? 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={obj.brightness ?? 100}
              style="--val: {(obj.brightness ?? 100) / 2}%"
              oninput={(e) => {
                const val = Number(e.currentTarget.value);
                updateObject(obj.id, { brightness: val }, false);
                onStyleChange?.("brightness", val);
              }}
              onchange={(e) => {
                updateObject(
                  obj.id,
                  { brightness: Number(e.currentTarget.value) },
                  true,
                );
              }}
            />
          </label>
          <label>
            <div class="row" style="justify-content: space-between;">
              <span>Contrast</span>
              <span>{Math.round(obj.contrast ?? 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={obj.contrast ?? 100}
              style="--val: {(obj.contrast ?? 100) / 2}%"
              oninput={(e) => {
                const val = Number(e.currentTarget.value);
                updateObject(obj.id, { contrast: val }, false);
                onStyleChange?.("contrast", val);
              }}
              onchange={(e) => {
                updateObject(
                  obj.id,
                  { contrast: Number(e.currentTarget.value) },
                  true,
                );
              }}
            />
          </label>
        </div>
      </div>
    {/if}
  </div>
</aside>

<style>
  .properties-panel {
    width: 260px;
    background: #2c2c2c; /* Panel BG */
    border-left: 1px solid #1a1a1a;
    display: flex;
    flex-direction: column;
    color: #e0e0e0;
    font-family: "Inter", system-ui, sans-serif;
    font-size: 11px; /* Compact font */
    flex-shrink: 0;
  }

  header {
    padding: 10px 15px;
    background: #2a2a2a;
    border-bottom: 1px solid #1a1a1a;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .header-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.8px;
  }

  .reset-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid #3a3a3a;
    color: #666;
    border-radius: 4px;
    padding: 3px 7px;
    font-size: 10px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
    white-space: nowrap;
  }
  .reset-btn:hover {
    background: #333;
    color: #aaa;
    border-color: #555;
  }

  .content {
    padding: 15px;
    overflow-y: auto;
    flex: 1;
  }

  .section {
    margin-bottom: 20px;
  }

  h4 {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #888;
    margin: 0 0 10px 0;
    letter-spacing: 0.5px;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  label span {
    color: #aaa;
    font-size: 10px;
  }

  input[type="number"],
  input[type="text"],
  select {
    background: #1a1a1a;
    border: 1px solid #444;
    color: #ccc;
    padding: 4px 6px;
    border-radius: 3px;
    width: 100%;
    font-size: 11px;
  }

  input:focus,
  select:focus {
    border-color: #2196f3;
    outline: none;
  }

  /* Range Sliders */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 12px; /* Track height */
    background: linear-gradient(
      to right,
      #d3763f var(--val, 50%),
      #1a1a1a var(--val, 50%)
    ); /* Muted orange and dark grey */
    border-radius: 6px; /* Rounded track */
    outline: none;
    margin: 6px 0;
    padding: 0;
    border: 1px solid #444; /* Match other input borders */
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px; /* Round thumb */
    height: 10px;
    border-radius: 50%;
    background: #cccccc;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    margin-top: 0px;
  }

  input[type="range"]:focus::-webkit-slider-thumb {
    box-shadow:
      0 0 0 2px #d3763f,
      0 1px 3px rgba(0, 0, 0, 0.5);
  }

  /* End Range Sliders */

  .unit-input {
    position: relative;
  }
  .unit {
    position: absolute;
    right: 6px;
    top: 4px;
    color: #666;
  }

  .full-width {
    grid-column: span 2;
  }

  .row {
    display: flex;
    gap: 8px;
  }
  .col {
    display: flex;
    flex-direction: column;
  }
  .items-center {
    align-items: center;
  }
  .mt-2 {
    margin-top: 8px;
  }
  .gap-2 {
    gap: 8px;
  }
  .flex-1 {
    flex: 1;
  }

  /* Color Swatch */
  .color-swatch-wrapper {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid #555;
    position: relative;
  }

  input[type="color"] {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    padding: 0;
    border: none;
    cursor: pointer;
  }

  .hex-input {
    width: 70px !important;
  }
  .label {
    flex: 1;
    color: #ccc;
  }

  /* Icon Buttons */
  .icon-btn {
    width: 28px;
    height: 24px;
    background: #444;
    border: none;
    color: #aaa;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: serif;
    font-size: 14px;
  }
  .icon-btn.active {
    background: #2196f3;
    color: white;
  }
  .text-bold {
    font-weight: bold;
  }
  .text-italic {
    font-style: italic;
  }

  .bg-dark {
    background: #1a1a1a;
    display: flex;
    border: 1px solid #444;
    border-radius: 3px;
    overflow: hidden;
  }

  /* Alignment Grids */
</style>
