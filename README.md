# Sylos UI

This repository hosts the Sylos desktop application built with [Wails](https://wails.io/), combining a Go backend with a React frontend.

## Structure

```
sylos-ui/
├── frontend/               # React app lives here
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── backend/
│   ├── main.go             # entry point, bootstraps Wails
│   ├── api/                # local Go API endpoints (mock for now)
│   ├── config/             # will load default / session JSON
│   └── bridge/             # go<->js bindings if needed
├── build/                  # Wails build outputs
├── .wails.json
├── go.mod
└── README.md
```

## Getting Started

- Install dependencies in `frontend/` via `npm install`.
- Run `npm run dev` within `frontend/` during development via Wails.
- The Go backend uses Go 1.21 and depends on Wails v2.
