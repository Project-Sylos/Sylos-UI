const logoModules = import.meta.glob<string>(
  "../assets/external/*.{png,svg,webp,jpg,jpeg}",
  { eager: true, import: "default" }
);

function normalizeServiceKey(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

const logosByServiceId = Object.fromEntries(
  Object.entries(logoModules).map(([path, url]) => {
    const filename = path.split("/").pop() ?? "";
    const serviceId = filename.replace(/\.[^.]+$/, "");
    return [normalizeServiceKey(serviceId), url];
  })
);

export function getExternalServiceLogo(serviceId: string): string | undefined {
  return logosByServiceId[normalizeServiceKey(serviceId)];
}

export function hasExternalServiceLogo(serviceId: string): boolean {
  return Boolean(getExternalServiceLogo(serviceId));
}
