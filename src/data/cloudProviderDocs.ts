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
  onedrive: {
    setupGuideUrl:
      "https://learn.microsoft.com/en-us/graph/auth-v2-user",
    setupGuideLabel: "Register a Microsoft Entra app for OneDrive",
    redirectUriHint:
      "In Microsoft Entra admin center → App registrations → your app → Authentication, add a Web redirect URI matching the Sylos redirect URI shown when you sign in. Grant delegated Files.ReadWrite.All, offline_access, and User.Read.",
  },
  sharepoint: {
    setupGuideUrl:
      "https://learn.microsoft.com/en-us/graph/auth-v2-user",
    setupGuideLabel: "Register a Microsoft Entra app for SharePoint",
    redirectUriHint:
      "In Microsoft Entra admin center → App registrations → your app → Authentication, add a Web redirect URI matching the Sylos redirect URI. Grant delegated Sites.ReadWrite.All, Files.ReadWrite.All, offline_access, and User.Read. The same Entra app can be reused for OneDrive with different scopes.",
  },
  box: {
    setupGuideUrl: "https://developer.box.com/guides/authentication/oauth2/oauth2-setup/",
    setupGuideLabel: "Create a Box Platform App (User Auth)",
    redirectUriHint:
      "In the Box Developer Console, create a Platform App with User Authentication (OAuth 2.0), add your Sylos redirect URI under OAuth 2.0 Redirect URIs, and enable the root_readwrite application scope.",
  },
};

export function getCloudProviderDoc(providerId: string): CloudProviderDoc | null {
  return cloudProviderDocs[providerId] ?? null;
}
