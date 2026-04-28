# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-28

### Added
- **Native SciFigura Bundles (`.sfs`)**: Transitioned into a fast, portable archive save format. All external images are safely bundled and structurally linked within the file to prevent broken paths during transfer.
- **Advanced Vector Sculpting (Node Editor)**: Introduced professional-grade Bezier node editing. Features include Affinity-style curve manipulations, dynamic point insertions (path splitting), independent anchor point modifications, and arc sculpting.
- **Vector Shape Conversions**: Import standard SVGs natively into structurally editable SciFigura primitives, complete with control paths. Basic shapes can also be selectively transformed into generic editable bezier paths.
- **Smart Journal Layout Presets**: A robust custom profile framework helping researchers configure and auto-reflow canvas structures based on rigorous Journal compliance metrics (Nature, Cell, custom defined).
- **Import & Export Systems**:
  - Full SVG and PDF component importing functionality.
  - Export capabilities generating configurable high-resolution imagery and DPI-controlled PDFs.
- **Auto-Save & Deep Crash Recovery**: Unobtrusive state management engine quietly stores sessions in the background ensuring zero data loss during unexpected crashes.
- **Canvas Alignment Pipeline**: Extensive toolbar options for distributing layouts evenly, managing complex object z-orders, and an intuitive drag-and-drop hierarchy inside the Layers Panel.
- **Real-Time Validation**: Continuous validation checks during layout construction providing actionable suggestions related to panel scaling and styling limits.
- **Documentation & Beta**: Integrated a quick-start interface overlay, helpful documentation, and a continuous beta-feedback system built right into the core welcome screens.

### Fixed
- Fixed an unstable Svelte reactivity drop related to live curve properties.
- Resolved various internal macOS platform signing bindings required for distribution releases.
- Tightened core tool keyboard shortcuts protecting inputs from UI overlay conflicts.
- Addressed multiple layer inspector stylistic persistence errors and optimized global toolbox sub-pixel positioning.
