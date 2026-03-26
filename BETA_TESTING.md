# SciFigura Beta Testing Guide

Thank you for testing SciFigura! Your feedback directly shapes what gets built next. This guide explains what to test, how to report issues, and what kinds of feedback are most valuable.

---

## What to Test

### Core Workflows
- [ ] **4-panel figure creation** — Layout presets → import images → add scale bars → add panel labels → export PDF/TIFF
- [ ] **Journal presets** — Switch between Nature, Cell, PNAS, A4, etc. Check canvas resizes correctly
- [ ] **Custom presets** — Create a custom journal preset with specific dimensions and min font size. Does it persist after restart?

### Drawing Tools
- [ ] **Shapes** — Rectangle, Ellipse, Line with arrowheads
- [ ] **Text** — Add text, change font, size, style via the Properties Panel
- [ ] **Panel Labels** — Auto-increment (A, B, C…), reset, style changes
- [ ] **Scale bars** — Add to microscopy images using pixel size and physical length

### Import & Export
- [ ] **Image import** — PNG, TIFF, JPEG, SVG, PDF. Are images sharp?
- [ ] **PNG export** — 72, 300, 600 DPI
- [ ] **TIFF export** — For journal submission
- [ ] **SVG export** — Open in Inkscape or Illustrator — are all shapes vector?
- [ ] **PDF export** — Open in Acrobat — are shapes vectors? Are images embedded?
- [ ] **Save/Load** — Save `.json`, close app, reopen, load file — is everything exactly as you left it?

### Validation Panel
- [ ] Scale an image up very large — does a DPI warning appear?
- [ ] Set a label to a tiny font on the Nature preset — does an error appear?
- [ ] Move an object outside the canvas — does a warning appear?
- [ ] Click a warning — does the canvas jump to and select that object?

### Auto-Save / Recovery
- [ ] Draw objects, wait 60 seconds, then force-quit the app
- [ ] Reopen — does the recovery dialog appear? Does "Yes, Restore" bring back your work?

### Layers Panel
- [ ] Drag layers to reorder — do objects stack in the correct order on canvas?
- [ ] Lock a layer — can you still interact with the locked object?

---

## How to Report Bugs

1. Go to [GitHub Issues](https://github.com/feldaher/scifigura/issues/new/choose)
2. Select **Bug Report**
3. Describe:
   - **What you did** (steps to reproduce)
   - **What you expected**
   - **What happened instead**
   - Your **OS and version** (e.g. macOS 14.5 Apple Silicon)
   - Attach your `.json` project file if relevant
   - Attach a screenshot if there's a visual issue

---

## Most Useful Feedback

Beyond bugs, we're especially interested in:

- **Workflow friction** — What steps feel unnecessarily complicated?
- **Missing features** — What's blocking you from using this for a real figure?
- **Journal compliance** — Did exported files get rejected by a journal submission system? What was the error?
- **Performance** — Is the canvas slow with large images or many objects?
- **UI confusion** — Any label, tooltip, or icon that wasn't clear?

Please share this in [GitHub Discussions](https://github.com/feldaher/scifigura/discussions) under the **Feedback** category.

---

## What's Out of Scope for Beta

We know about these and are tracking them — please don't report:

- Windows high-DPI display scaling artefacts (tracked in #TBD)
- PDF text not being selectable (embedded as vectors, not PDF text objects — by design)

---

## Thank You

Your time is incredibly valuable. Every piece of feedback helps make SciFigura better for researchers everywhere. 🙏
