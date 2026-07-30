export type CloudProviderDoc = {
  setupGuideUrl: string;
  setupGuideLabel: string;
  redirectUriHint: string;
};

export const cloudProviderDocs: Record<string, CloudProviderDoc> = {
  google_drive: {
    setupGuideUrl:
      "https://developers.google.com/workspace/drive/api/guides/about-auth",
    setupGuideLabel: "Set up a Google Drive OAuth app",
    redirectUriHint:
      "Add an authorized redirect URI that exactly matches what Sylos sends (origin + trailing slash), e.g. http://localhost:8086/ — not http://localhost:8086 without the slash.",
  },
  dropbox: {
    setupGuideUrl: "https://www.dropbox.com/developers/apps/create",
    setupGuideLabel: "Create a Dropbox developer app",
    redirectUriHint:
      "Under Redirect URIs, add the exact URI Sylos sends: origin with a trailing slash (e.g. http://localhost:8086/). Dropbox rejects http://localhost:8086 without the slash.",
  },
  onedrive: {
    setupGuideUrl:
      "https://learn.microsoft.com/en-us/graph/auth-v2-user",
    setupGuideLabel: "Register a Microsoft Entra app for OneDrive",
    redirectUriHint:
      "In App registrations → Authentication, add a Web redirect URI matching Sylos exactly (e.g. http://localhost:8086/ with trailing slash). Set signInAudience to AzureADandPersonalMicrosoftAccount. Grant delegated Files.ReadWrite.All, offline_access, and User.Read. Sylos uses the common authority for sign-in.",
  },
  sharepoint: {
    setupGuideUrl:
      "https://learn.microsoft.com/en-us/graph/auth-v2-user",
    setupGuideLabel: "Register a Microsoft Entra app for SharePoint",
    redirectUriHint:
      "In App registrations → Authentication, add a Web redirect URI matching Sylos exactly (e.g. http://localhost:8086/ with trailing slash). Grant delegated Sites.ReadWrite.All, Files.ReadWrite.All, offline_access, and User.Read. Sylos uses the common authority for sign-in. The same Entra app can be reused for OneDrive.",
  },
  box: {
    setupGuideUrl: "https://developer.box.com/guides/authentication/oauth2/oauth2-setup/",
    setupGuideLabel: "Create a Box Platform App (User Auth)",
    redirectUriHint:
      "Under OAuth 2.0 Redirect URIs, add the exact URI Sylos sends (e.g. http://localhost:8086/ with trailing slash), and enable the root_readwrite application scope.",
  },
};

export function getCloudProviderDoc(providerId: string): CloudProviderDoc | null {
  return cloudProviderDocs[providerId] ?? null;
}
