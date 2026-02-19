# Scientific Figure Studio

[![CI](https://github.com/feldaher/scifigura/actions/workflows/ci.yml/badge.svg)](https://github.com/feldaher/scifigura/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.10-24c8db)](https://tauri.app)
[![Svelte 5](https://img.shields.io/badge/Svelte-5.50-ff3e00)](https://svelte.dev)

Free, open-source desktop application for creating publication-ready scientific figures.

## Overview

Scientific Figure Studio addresses critical pain points in scientific publishing:

- **Consistency enforcement** — Global styles eliminate hours of manual formatting
- **Journal-aware reformatting** — One-click adaptation to different journal requirements
- **Intelligent scale bars** — Auto-calculated from image metadata (coming soon)
- **Multi-panel layouts** — Grid systems and smart alignment tools

Built for life sciences researchers who need professional figures without design expertise.

## Tech Stack

- **[Tauri 2](https://tauri.app)** — Cross-platform desktop framework (Rust + WebView)
- **[Svelte 5](https://svelte.dev)** — Reactive UI framework with runes
- **[SvelteKit](https://kit.svelte.dev)** — Full-stack web framework
- **[TypeScript](https://www.typescriptlang.org)** — Type-safe JavaScript
- **[Vite](https://vitejs.dev)** — Lightning-fast build tool
- **[pnpm](https://pnpm.io)** — Efficient package manager

## Development Setup

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **Rust** 1.70+ ([install](https://rustup.rs))
- **pnpm** (install via `npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone https://github.com/feldaher/scifigura.git
cd scifigura

# Install dependencies
pnpm install

# Run development server
pnpm tauri dev
```

### Build Commands

```bash
# Development mode (hot reload)
pnpm tauri dev

# Production build
pnpm build
pnpm tauri build

# Type checking
pnpm check

# Linting
pnpm lint
```

## Project Status

🚧 **MVP in Development** — Following the [6-month roadmap](https://github.com/feldaher/scifigura/milestones)

**Current Milestone:** 5 - Expert/Import 📥
**Next Up:** Polish & Beta (Cross-platform builds, user guide)

See [open issues](https://github.com/feldaher/scifigura/issues) for detailed task breakdown.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- How to set up your development environment
- Code style guidelines
- Pull request process
- Good first issues

## Roadmap

Scientific Figure Studio is being built in 6 milestones:

1. **Bootstrap** ✅ — Project setup, CI, documentation
2. **Canvas Foundation** — Zoomable canvas, shapes, rulers
3. **Layout & Styles** — Multi-panel layouts, global styles
4. **Scientific Features** — Scale bars, panel labels, journal presets
5. **Import/Export** — Save/load projects, PDF export
6. **Polish & Beta** — Cross-platform builds, user guide

Full roadmap: [45 issues across 6 milestones](https://github.com/feldaher/scifigura/milestones)

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

Inspired by the needs of researchers worldwide who spend too much time fighting with PowerPoint and Illustrator. This tool will always be free and open source.

---

**Made with** ❤️ **for the scientific community**
