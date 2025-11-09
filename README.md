# Sylos UI

Sylos UI is a desktop application built with [Wails](https://wails.io/), combining a Go backend with a Vite/React frontend. Platform icons for Linux, Windows, and macOS are bundled with the source.

## Prerequisites

- Go 1.21+
- Node.js 20.19+ (Node 22.x recommended)
- Wails CLI v2 (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

## Project Structure

```
Sylos-UI/
├── build/                     # Wails build output (generated)
│   └── bin/                   # Platform binaries land here
├── build.sh                   # Helper script: build frontend, then run `wails dev`
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
│   │   │       ├── Sylos-Magenta-S.png      # Base artwork / Linux icon
│   │   │       ├── Sylos-Magenta-S.ico      # Windows icon
│   │   │       ├── Sylos-Magenta-S.icns     # macOS icon
│   │   │       └── main-app-logo*.png
│   │   ├── components/
│   │   │   └── AnimatedBackground.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── pages/             # reserved for future routing
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── go.mod
├── go.sum
├── main.go                    # Wails bootstrap + static asset embed
├── README.md
└── wails.json
```

## Development Workflow

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start the desktop app in dev mode**
   ```bash
   cd /home/logan/Documents/GitHub/Sylos-UI
   ./build.sh
   ```
   The script runs `npm run build` for the frontend, then launches `wails dev`.

3. **Frontend-only iteration**
   ```bash
   cd frontend
   npm run dev
   ```
   Vite serves the React UI while Wails keeps using the dev server.

## Building Distributables

Use the Wails CLI and pass the correct icon format per platform:

```bash
# Linux (PNG)
wails build -platform linux/amd64 \
  -icon frontend/src/assets/logos/Sylos-Magenta-S.png

# Windows (ICO)
wails build -platform windows/amd64 \
  -icon frontend/src/assets/logos/Sylos-Magenta-S.ico

# macOS (ICNS)
wails build -platform darwin/universal \
  -icon frontend/src/assets/logos/Sylos-Magenta-S.icns
```

Artifacts are emitted under `build/bin/`. Adjust `-platform` values to match your target architecture or run the build on the destination OS.