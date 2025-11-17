# Sylos UI

Sylos UI is a web application built with [Vite](https://vitejs.dev/) and [React](https://react.dev/). The application runs in your browser at `localhost:3000`.

## Prerequisites

- Node.js 20.19+ (Node 22.x recommended)
- npm or yarn
- A modern web browser (Chrome, Edge, Firefox, or Safari)

## Project Structure

```
Sylos-UI/
├── frontend/
│   ├── dist/                  # Vite production bundle (generated)
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── src/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── assets/
│   │   │   ├── backgrounds/
│   │   │   └── logos/
│   │   ├── components/
│   │   │   └── AnimatedBackground.tsx
│   │   ├── pages/
│   │   └── utils/
│   │       └── folderPicker.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── build.ps1                   # PowerShell script to start dev server (Windows)
├── package.json                # Root package.json
└── README.md
```

## Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   ```
   This will install both root and frontend dependencies.

2. **Start the development server**
   ```bash
   # Windows
   .\build.ps1

   # Or from root
   npm run dev

   # Or directly from frontend
   cd frontend
   npm run dev
   ```
   The Vite dev server will start on `http://localhost:3000` and automatically open your browser.

3. **Build for production**
   ```bash
   npm run build
   ```
   This creates an optimized production build in `frontend/dist/`.

4. **Preview production build**
   ```bash
   npm run preview
   ```
   This serves the production build locally for testing.

## Notes

- The application connects to a Go API service running on `localhost:8080`
- Directory selection uses the browser's File System Access API (Chrome/Edge) or falls back to a file input element
- WebGL is used for the animated background - modern browsers have excellent support