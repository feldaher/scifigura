# Contributing to Scientific Figure Studio

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork:**

   ```bash
   git clone https://github.com/YOUR_USERNAME/scifigura.git
   cd scifigura
   ```

3. **Install dependencies:**

   ```bash
   pnpm install
   ```

4. **Create a branch** for your work:

   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Start the development server:**
   ```bash
   pnpm tauri dev
   ```

### Prerequisites

- **Node.js** 18+ and **pnpm**
- **Rust** 1.70+ (install via [rustup](https://rustup.rs))
- Familiarity with Svelte 5 and TypeScript is helpful
- For Rust backend work, familiarity with Tauri is beneficial

## How to Contribute

### Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Steps to reproduce
- Expected vs. actual behavior
- OS and version (macOS, Windows, Linux)
- Screenshots if applicable

### Suggesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:

- Problem you're trying to solve
- Proposed solution
- Alternative approaches considered

### Contributing Code

1. **Check for existing issues** — Look for [good first issues](https://github.com/feldaher/scifigura/labels/good%20first%20issue)
2. **Comment on the issue** you want to work on to avoid duplicate effort
3. **Follow the development workflow** below
4. **Submit a pull request** when ready

## Development Workflow

### Code Style

**TypeScript/Svelte:**

- Use **TypeScript** for type safety
- Follow **Svelte 5 runes** syntax (`$state`, `$derived`, etc.)
- Use **2 spaces** for indentation
- Run `pnpm check` before committing

**Rust:**

- Follow standard **Rust formatting** (`cargo fmt`)
- Run `cargo clippy` to catch common issues
- Write doc comments for public APIs

### Commit Messages

Use conventional commit format:

```
type(scope): brief description

Optional longer description explaining the change

Fixes #123
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**

- `feat(canvas): add zoom controls to toolbar`
- `fix(scale-bar): correct pixel-to-micron calculation`
- `docs(readme): update build instructions`

### Pull Request Process

1. **Ensure tests pass:**

   ```bash
   pnpm check
   pnpm build
   ```

2. **Update documentation** if you changed APIs or added features

3. **Fill out the PR template** completely:
   - Description of changes
   - Related issue number (`Fixes #123`)
   - Testing done
   - Screenshots for UI changes

4. **Request review** from maintainers

5. **Address feedback** — Be responsive to review comments

6. **Squash commits** if requested before merging

### Testing

- **Type checking:** `pnpm check`
- **Build verification:** `pnpm build`
- **Manual testing:** `pnpm tauri dev` — Verify your changes work as expected

Unit tests and integration tests will be added in Milestone 2.

## Project Structure

```
scifigura/
├── src/                      # Svelte frontend
│   ├── routes/              # SvelteKit pages
│   ├── lib/                 # Reusable components (future)
│   └── app.html             # HTML template
├── src-tauri/               # Rust backend
│   ├── src/
│   │   └── main.rs          # Tauri entry point
│   └── Cargo.toml           # Rust dependencies
├── static/                  # Static assets
└── .github/                 # Issue/PR templates, workflows
```

## Contribution Ideas

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/feldaher/scifigura/labels/good%20first%20issue):

- Documentation improvements
- UI refinements
- Journal preset contributions (just JSON!)

### High-Impact Contributions

- **Journal presets** — Add new journal specifications (see `presets/` in future)
- **Canvas features** — Implement shapes, alignment, or layer management
- **Export formats** — Add EPS, TIFF, or SVG export support
- **OS testing** — Test on Windows/Linux and report bugs

### Non-Code Contributions

- **Documentation** — Tutorials, guides, examples
- **Design** — UI mockups, icon design
- **Community** — Answer questions in Discussions
- **Testing** — File detailed bug reports

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming and inclusive environment.

## Questions?

- **GitHub Discussions:** Ask questions and share ideas
- **Issues:** Report bugs or suggest features
- **Discord:** (Coming soon)

---

Thank you for making Scientific Figure Studio better for researchers worldwide! 🔬✨
