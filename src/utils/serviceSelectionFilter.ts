import { ProviderDescriptor } from "../types/providers";
import { ServiceDescriptor } from "../types/services";
import { isCloudProviderOAuthConfigured } from "./cloudProviderOAuth";
import { isCloudServiceType, serviceIdToProviderId } from "./cloudProviders";

export function providerIdForService(service: ServiceDescriptor): string {
  const fromMeta = service.metadata?.providerId;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim();
  }
  return serviceIdToProviderId(service.id);
}

/** Whether a catalog service is ready enough to use (OAuth app configured, etc.). */
export function isServiceSetUp(
  service: ServiceDescriptor,
  providersById: Map<string, ProviderDescriptor>
): boolean {
  if (!isCloudServiceType(service.type)) {
    return true;
  }

  const provider = providersById.get(providerIdForService(service));
  if (!provider) {
    // No provider descriptor — keep visible so admins can still investigate.
    return true;
  }
  if (provider.authType === "credentials_form") {
    return true;
  }
  return isCloudProviderOAuthConfigured(provider.oauthClientId);
}

export function shouldShowServiceInSelection(params: {
  service: ServiceDescriptor;
  spectraEligible: boolean;
  showSpectra: boolean;
  hideUnsetServices: boolean;
  providersById: Map<string, ProviderDescriptor>;
}): boolean {
  const { service, spectraEligible, showSpectra, hideUnsetServices, providersById } =
    params;

  if (service.type === "spectra") {
    if (!spectraEligible) return false;
    return showSpectra;
  }

  if (hideUnsetServices && !isServiceSetUp(service, providersById)) {
    return false;
  }

  return true;
}
