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
      "Add your Sylos redirect URI in Google Cloud Console under APIs & Services → Credentials → your OAuth client → Authorized redirect URIs. Use the redirect URI shown in Sylos when you sign in.",
  },
  dropbox: {
    setupGuideUrl: "https://www.dropbox.com/developers/apps/create",
    setupGuideLabel: "Create a Dropbox developer app",
    redirectUriHint:
      "In the Dropbox App Console, add your Sylos redirect URI under Redirect URIs. Use the redirect URI shown in Sylos when you sign in.",
  },
};

export function getCloudProviderDoc(providerId: string): CloudProviderDoc | null {
  return cloudProviderDocs[providerId] ?? null;
}
