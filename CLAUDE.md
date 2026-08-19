# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This is the source repository for a GitHub Pages user site (`devantehorne.github.io`), served at the custom domain configured in `CNAME` (`devantehorne.me`). GitHub Pages builds and serves whatever is committed to this repo directly — there is no build step, bundler, package manager, or test suite in this repository.

## Current state

The repository currently contains only:
- `CNAME` — custom domain configuration for GitHub Pages (`devantehorne.me`). Do not remove this unless intentionally detaching the custom domain, since doing so breaks the live site's DNS mapping.
- `README.md` — minimal, title only.
- `crema-avatar.png`, `crema-cup-avatar.png`, `espresso-ski.png` — image assets not yet referenced by any page.

There is no `index.html` or other site content yet, so there is currently no live page markup to edit — a page must be created from scratch when site content is added.

## Working in this repo

- Changes take effect by committing directly to the branch GitHub Pages is configured to publish from; there is no build/lint/test command to run.
- Since GitHub Pages serves files as-is, any HTML/CSS/JS added later should be verified by opening the file locally in a browser (no local server or build required unless one is introduced).
- Image assets in the repo root are large (multi-MB); avoid adding further large binaries unless necessary, and prefer optimized/compressed formats for anything meant to be used on the live site.
