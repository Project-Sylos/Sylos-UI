# Sylos UI

Sylos UI is a web application built with [Vite](https://vitejs.dev/) and [React](https://react.dev/). The application runs in your browser at `localhost:3000`.

## Prerequisites

- Node.js 20.19+ (Node 22.x recommended)
- npm or yarn
- A modern web browser (Chrome, Edge, Firefox, or Safari)

## Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   ```
   This will install dependencies.

2. **Start the development server**
   ```bash
   npm run dev
   ```
   The Vite dev server will start on `http://localhost:3000` and automatically open your browser.

3. **Build for production**
   ```bash
   npm run build
   ```
   This creates an optimized production build in `dist/`.

4. **Preview production build**
   ```bash
   npm run preview
   ```
   This serves the production build locally for testing.

## Notes

- The application connects to a Go API service running on `localhost:8086`
- Directory selection uses the browser's File System Access API (Chrome/Edge) or falls back to a file input element
- WebGL is used for the animated background - modern browsers have excellent support