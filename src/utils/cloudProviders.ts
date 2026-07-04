/** API provider path uses underscores; SetRoot / services catalog uses hyphens. */
export function serviceIdToProviderId(serviceId: string): string {
  return serviceId.replace(/-/g, "_");
}

export function providerIdToServiceId(providerId: string): string {
  return providerId.replace(/_/g, "-");
}

export function isCloudServiceType(type: string | undefined): boolean {
  return type === "cloud";
}
