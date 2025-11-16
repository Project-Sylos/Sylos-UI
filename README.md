# Sylos UI

Sylos UI is a desktop application built with [Electron](https://www.electronjs.org/), combining a Node.js backend with a Vite/React frontend. Platform icons for Linux, Windows, and macOS are bundled with the source.

## Prerequisites

- Node.js 20.19+ (Node 22.x recommended)
- npm or yarn

## Project Structure

```
Sylos-UI/
├── build/                     # Electron build output (generated)
│   └── bin/                   # Platform installers land here
├── build.sh                   # Helper script: start Vite dev server + Electron
├── main/                      # Electron main process
│   ├── main.js               # Main process entry point
│   └── preload.js            # Preload script for secure IPC
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
│   │   │   │   └── main-app-background.png
│   │   │   └── logos/
│   │   │       ├── Sylos-Magenta-S.png      # Linux icon
│   │   │       ├── Sylos-Magenta-S.ico      # Windows icon
│   │   │       ├── Sylos-Magenta-S.icns     # macOS icon
│   │   │       └── main-app-logo*.png
│   │   ├── components/
│   │   │   └── AnimatedBackground.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── pages/
│   │   └── utils/
│   │       ├── electron.ts   # Electron API wrapper
│   │       └── folderPicker.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── electron-builder.yml       # Electron Builder configuration
├── package.json               # Root package.json with Electron dependencies
└── README.md
```

## Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   ```
   This will install both root and frontend dependencies.

2. **Start the desktop app in dev mode**
   ```bash
   ./build.sh
   ```
   The script starts the Vite dev server and launches Electron in development mode.

   Alternatively, you can run them separately:
   ```bash
   # Terminal 1: Start Vite dev server
   cd frontend
   npm run dev

   # Terminal 2: Start Electron
   npm run dev
   ```

3. **Frontend-only iteration**
   ```bash
   cd frontend
   npm run dev
   ```
   Vite serves the React UI on `http://localhost:5173`.

## Building Distributables

Build for all platforms:
```bash
npm run build
```

Build for a specific platform:
```bash
# Linux
npm run build:linux

# Windows
npm run build:win

# macOS
npm run build:mac
```

Build outputs are generated in `build/bin/`:
- **Linux**: AppImage and .deb packages
- **Windows**: NSIS installer (.exe)
- **macOS**: DMG and ZIP archives

## Notes

- The application connects to a Go API service running on `localhost:8080`
- Electron uses Chromium for rendering, providing full CSS/WebGL support across all platforms
- Icons are automatically included in builds based on platform