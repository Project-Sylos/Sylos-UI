const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { execSync } = require("child_process");

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// Also set via commandLine as backup
if (process.platform === "win32") {
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("use-angle", "d3d11");
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  console.log("🎮 Windows GPU: Forcing D3D11 hardware acceleration");
} else if (process.platform === "linux") {
  // Linux: Try desktop OpenGL first, fallback to ANGLE if needed
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("use-gl", "desktop");
  // Note: VaapiVideoDecoder and UseSkiaRenderer already set globally above
  app.commandLine.appendSwitch("enable-webgl");
  app.commandLine.appendSwitch("enable-webgl2");
  console.log("🎮 Linux GPU: Using desktop OpenGL");
} else if (process.platform === "darwin") {
  // macOS: Use Metal (default)
  app.commandLine.appendSwitch("enable-webgl");
  app.commandLine.appendSwitch("enable-webgl2");
  console.log("🎮 macOS GPU: Using Metal for hardware acceleration");
}

/**
 * Detects if the system has both NVIDIA and AMD GPUs (hybrid setup)
 * @returns {boolean} True if both NVIDIA and AMD GPUs are detected
 */
function isHybridNvidia() {
  if (process.platform !== "linux") {
    return false;
  }
  
  try {
    const lspci = execSync("lspci | grep -E 'VGA|3D|Display'", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).toString();
    
    const hasNvidia = lspci.includes("NVIDIA");
    const hasAMD = /AMD.*Radeon|AMD.*Ryzen/i.test(lspci);
    
    return hasNvidia && hasAMD;
  } catch (error) {
    // lspci might not be available or command failed
    console.log("GPU detection: Could not detect hybrid GPU setup:", error.message);
    return false;
  }
}

// Try enabling NVIDIA offload on AMD/NVIDIA hybrid systems (Linux only)
if (process.platform === "linux") {
  // Always attempt NVIDIA offload on Linux (safe - Linux ignores if not applicable)
  process.env.__NV_PRIME_RENDER_OFFLOAD = "1";
  process.env.__GLX_VENDOR_LIBRARY_NAME = "nvidia";
  
  // Log if we detect a hybrid system
  if (isHybridNvidia()) {
    console.log("🎮 Detected hybrid NVIDIA/AMD GPU system - enabling NVIDIA offload");
  } else {
    console.log("🎮 Setting NVIDIA offload (will be ignored if not applicable)");
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Sylos",
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Send GPU status to renderer after DOM is ready
  // On Windows, never disable GPU - always let WebGL try
  mainWindow.webContents.once("dom-ready", () => {
    const gpuDisabled = process.platform !== "win32" && process.env.SYLOS_GPU_DISABLED === "1";
    mainWindow.webContents.executeJavaScript(
      `window.__SYLOS_GPU_DISABLED__ = ${gpuDisabled};`
    );
  });

  // Load the app
  if (isDev) {
    // Development: Load from Vite dev server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Production: Load from built frontend
    const indexPath = path.join(__dirname, "../frontend/dist/index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function getIconPath() {
  const platform = process.platform;
  const iconDir = path.join(__dirname, "../frontend/src/assets/logos");

  if (platform === "win32") {
    return path.join(iconDir, "Sylos-Magenta-S.ico");
  } else if (platform === "darwin") {
    return path.join(iconDir, "Sylos-Magenta-S.icns");
  } else {
    return path.join(iconDir, "Sylos-Magenta-S.png");
  }
}

// IPC handlers
ipcMain.handle("open-directory-dialog", async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options?.title || "Select a folder",
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] || null;
});

app.whenReady().then(async () => {
  // GPU inspection and acceleration detection
  // Get GPU feature status from Electron
  const gpuInfo = app.getGPUFeatureStatus();
  
  console.log("\n=== Hardware Acceleration Status ===");
  console.log("GPU Feature Status:", gpuInfo);
  
  // On Windows, ALWAYS allow WebGL to attempt initialization
  // Electron's GPU status can be misleading - ANGLE/D3D11 may still work
  // even when Electron reports "disabled_software"
  if (process.platform === "win32") {
    // Never disable GPU on Windows - let WebGL try and fail gracefully if needed
    console.log("✅ Windows: Allowing WebGL attempt (ANGLE D3D11 may work even if Electron reports software)");
  } else {
    // On other platforms, check if hardware acceleration is available
    const isHardwareAccelerated =
      gpuInfo.webgl === "enabled" ||
      gpuInfo["2d_canvas"] === "enabled" ||
      gpuInfo.gpu_compositing === "enabled" ||
      gpuInfo.opengl === "enabled";
    
    if (!isHardwareAccelerated) {
      process.env.SYLOS_GPU_DISABLED = "1";
      console.log("⚠️  GPU acceleration not available - animations will be disabled");
    }
  }
  
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

