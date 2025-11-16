import { useEffect, useRef } from "react";
import "./AnimatedBackground.css";

// Vertex shader - simple fullscreen quad
const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_uv = a_position * 0.5 + 0.5;
  }
`;

// Fragment shader - animated gradient blobs
const fragmentShader = `
  precision mediump float;
  
  uniform float u_time;
  uniform vec2 u_resolution;
  varying vec2 v_uv;
  
  // Helper function for smooth blending
  float smoothMin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  
  // Circular blob function
  // center and v_uv are in normalized coordinates (0-1), convert to pixels for distance calc
  float blob(vec2 center, float radius, float softness) {
    vec2 uvPixels = v_uv * u_resolution;
    vec2 centerPixels = center * u_resolution;
    float dist = distance(uvPixels, centerPixels);
    return smoothstep(radius + softness, radius - softness, dist);
  }
  
  void main() {
    vec2 uv = v_uv;
    float time = u_time;
    
    // Create 5 animated blobs with different positions and movements
    // Use normalized coordinates (0-1) with visible movement offsets
    vec2 blob1_center = vec2(0.2, 0.3) + vec2(
      cos(time * 0.4 + 0.5) * 0.15,
      sin(time * 0.3 + 0.2) * 0.12
    );
    
    vec2 blob2_center = vec2(0.8, 0.25) + vec2(
      cos(time * 0.35 - 0.3) * -0.13,
      sin(time * 0.4 + 1.0) * 0.15
    );
    
    vec2 blob3_center = vec2(0.4, 0.8) + vec2(
      cos(time * 0.38 + 2.0) * 0.18,
      sin(time * 0.32 - 0.5) * 0.10
    );
    
    vec2 blob4_center = vec2(0.7, 0.6) + vec2(
      cos(time * 0.33 + 1.5) * -0.12,
      sin(time * 0.37 - 1.2) * -0.16
    );
    
    vec2 blob5_center = vec2(0.3, 0.7) + vec2(
      cos(time * 0.36 + 3.0) * 0.14,
      sin(time * 0.34 + 0.8) * 0.13
    );
    
    // Calculate blob intensities with varying sizes (in pixels)
    // Convert normalized sizes to pixels based on resolution
    float baseRadius = min(u_resolution.x, u_resolution.y) * 0.3; // Scale with screen size
    float blob1 = blob(blob1_center, baseRadius * (1.0 + sin(time * 0.2) * 0.2), baseRadius * 0.6);
    float blob2 = blob(blob2_center, baseRadius * (1.1 + cos(time * 0.25) * 0.25), baseRadius * 0.65);
    float blob3 = blob(blob3_center, baseRadius * (0.95 + sin(time * 0.22) * 0.18), baseRadius * 0.55);
    float blob4 = blob(blob4_center, baseRadius * (0.9 + cos(time * 0.23) * 0.2), baseRadius * 0.58);
    float blob5 = blob(blob5_center, baseRadius * (1.05 + sin(time * 0.21) * 0.22), baseRadius * 0.62);
    
    // Combine blobs with smooth blending
    float combined = smoothMin(smoothMin(blob1, blob2, 200.0), 
                               smoothMin(blob3, blob4, 200.0), 200.0);
    combined = smoothMin(combined, blob5, 200.0);
    
    // Color gradients - cyan, magenta, purple
    vec3 color1 = vec3(0.0, 1.0, 1.0);      // Cyan
    vec3 color2 = vec3(1.0, 0.0, 1.0);      // Magenta
    vec3 color3 = vec3(0.6, 0.3, 1.0);      // Purple
    vec3 color4 = vec3(1.0, 0.47, 0.78);    // Pink-magenta
    vec3 color5 = vec3(0.0, 0.78, 1.0);     // Light cyan
    
    // Weight colors by blob intensities - use max instead of division for brighter result
    vec3 finalColor = (
      blob1 * color1 * 0.7 +
      blob2 * color2 * 0.7 +
      blob3 * color3 * 0.6 +
      blob4 * color4 * 0.6 +
      blob5 * color5 * 0.6
    );
    
    // Normalize by max component to prevent over-brightening
    float maxComponent = max(max(finalColor.r, finalColor.g), finalColor.b);
    if (maxComponent > 0.0) {
      finalColor = finalColor / max(1.0, maxComponent);
    }
    
    // Soft fade to transparent edges (less aggressive fade)
    vec2 centerDist = abs(uv - 0.5);
    float edgeFade = 1.0 - smoothstep(0.4, 0.8, max(centerDist.x, centerDist.y));
    
    // Increase alpha for much better visibility
    float alpha = clamp(combined * edgeFade * 1.5, 0.0, 1.0);
    vec3 enhancedColor = finalColor * 1.5; // Boost color intensity significantly
    
    gl_FragColor = vec4(enhancedColor, alpha);
  }
`;

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());
  const programRef = useRef<WebGLProgram | null>(null);

  // Check if GPU is disabled (via Electron preload or fallback)
  const gpuDisabled = 
    (window.sylos?.gpuDisabled === true) ||
    (window.__SYLOS_GPU_DISABLED__ === true);

  useEffect(() => {
    // If GPU is disabled, don't initialize WebGL
    if (gpuDisabled) {
      console.log("AnimatedBackground: GPU disabled - using static background");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      console.error("AnimatedBackground: Canvas ref is null");
      return;
    }

    console.log("AnimatedBackground: Initializing WebGL...");

    // Get WebGL context with error handling
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
    }) as WebGLRenderingContext | null;

    if (!gl) {
      console.error("AnimatedBackground: WebGL not supported");
      // Try webgl2 as fallback
      const gl2 = canvas.getContext("webgl2") as WebGLRenderingContext | null;
      if (!gl2) {
        console.error("AnimatedBackground: WebGL2 also not supported");
        return;
      }
      console.error("AnimatedBackground: Using WebGL2 fallback");
    }

    const context = gl!;

    // Set canvas size
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, window.innerWidth);
      const height = Math.max(rect.height, window.innerHeight);
      
      if (width > 0 && height > 0) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        context.viewport(0, 0, canvas.width, canvas.height);
      } else {
        console.warn(`AnimatedBackground: Invalid canvas size ${width}x${height}`);
      }
    };
    
    // Initial resize
    resize();
    
    // Force resize after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(resize, 100);
    
    window.addEventListener("resize", resize);

    // Compile shader
    const compileShader = (
      source: string,
      type: number
    ): WebGLShader | null => {
      const shader = context.createShader(type);
      if (!shader) {
        console.error("AnimatedBackground: Failed to create shader");
        return null;
      }
      context.shaderSource(shader, source);
      context.compileShader(shader);
      if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
        console.error(
          "AnimatedBackground: Shader compile error:",
          context.getShaderInfoLog(shader)
        );
        context.deleteShader(shader);
        return null;
      }
      return shader;
    };

    // Create program
    const vertex = compileShader(vertexShader, context.VERTEX_SHADER);
    const fragment = compileShader(fragmentShader, context.FRAGMENT_SHADER);
    if (!vertex || !fragment) {
      console.error("AnimatedBackground: Failed to compile shaders");
      return;
    }

    const program = context.createProgram();
    if (!program) {
      console.error("AnimatedBackground: Failed to create program");
      return;
    }
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);

    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      console.error("AnimatedBackground: Program link error:", context.getProgramInfoLog(program));
      return;
    }

    context.useProgram(program);
    programRef.current = program;
    console.log("AnimatedBackground: WebGL program linked successfully");

    // Create fullscreen quad
    const positionBuffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      context.STATIC_DRAW
    );

    const positionLocation = context.getAttribLocation(program, "a_position");
    if (positionLocation === -1) {
      console.error("AnimatedBackground: Failed to get position attribute location");
      return;
    }
    context.enableVertexAttribArray(positionLocation);
    context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);

    // Get uniform locations
    const timeLocation = context.getUniformLocation(program, "u_time");
    const resolutionLocation = context.getUniformLocation(program, "u_resolution");
    
    if (!timeLocation || !resolutionLocation) {
      console.error("AnimatedBackground: Failed to get uniform locations", { timeLocation, resolutionLocation });
      return;
    }

    // Enable blending for transparency
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);

    // Set clear color to transparent black
    context.clearColor(0, 0, 0, 0);
    
    // Test: Set a solid background color to verify rendering works
    // context.clearColor(1, 0, 1, 1); // Magenta - uncomment to test

    // Animation loop
    let frameCount = 0;
    const animate = () => {
      // Ensure canvas has valid dimensions
      if (canvas.width === 0 || canvas.height === 0) {
        resize();
        if (canvas.width === 0 || canvas.height === 0) {
          animationFrameRef.current = requestAnimationFrame(animate);
          return;
        }
      }

      const elapsed = (Date.now() - startTimeRef.current) / 1000.0;

      context.uniform1f(timeLocation, elapsed);
      context.uniform2f(resolutionLocation, canvas.width, canvas.height);

      context.clear(context.COLOR_BUFFER_BIT);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);

      // Log first few frames to verify rendering
      frameCount++;
      if (frameCount === 1) {
        console.log("AnimatedBackground: First frame rendered");
      } else if (frameCount === 60) {
        console.log("AnimatedBackground: 60 frames rendered - animation working");
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation after ensuring canvas is ready
    const startAnimation = () => {
      if (canvas.width > 0 && canvas.height > 0) {
        console.log("AnimatedBackground: Starting animation loop");
        animate();
      } else {
        console.log("AnimatedBackground: Waiting for canvas dimensions...");
        setTimeout(startAnimation, 50);
      }
    };

    startAnimation();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      // Don't log cleanup on every render - only log if actually cleaning up
      // console.log("AnimatedBackground: Cleaned up");
    };
  }, [gpuDisabled]);

  // If GPU is disabled, return a static gradient background instead
  if (gpuDisabled) {
    return (
      <div 
        className="sylos-webgl-bg"
        style={{
          background: "linear-gradient(135deg, rgba(96, 48, 160, 0.3) 0%, rgba(160, 32, 160, 0.3) 50%, rgba(0, 192, 255, 0.2) 100%)",
        }}
      />
    );
  }

  return <canvas ref={canvasRef} className="sylos-webgl-bg" />;
}
