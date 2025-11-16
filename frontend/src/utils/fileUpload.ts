export function pickDBFile(title: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".db";
    input.style.display = "none";

    const cleanup = () => {
      if (input.parentNode === document.body) {
        document.body.removeChild(input);
      }
    };

    input.addEventListener("change", (event) => {
      try {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0] ?? null;
        cleanup();
        resolve(file);
      } catch (err) {
        cleanup();
        resolve(null);
      }
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    // Handle errors during file selection
    try {
      document.body.appendChild(input);
      input.click();
      
      // Fallback: cleanup after a timeout in case events don't fire
      setTimeout(() => {
        cleanup();
        // Only resolve null if input still exists (wasn't cleaned up by event)
        if (input.parentNode === document.body) {
          resolve(null);
        }
      }, 10000); // 10 second timeout
    } catch (err) {
      cleanup();
      resolve(null);
    }
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

