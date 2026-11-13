import { createWarden } from "@abdullahaltatan/warden-js";

const issuer = import.meta.env.VITE_WARDEN_ISSUER;

const clientId = import.meta.env.VITE_WARDEN_CLIENT_ID;

if (!issuer || !clientId) {
  throw new Error("Set VITE_WARDEN_ISSUER and VITE_WARDEN_CLIENT_ID (see .env.example)");
}

// Redirect to the site root, not /callback: a static host has no rewrite for other paths.
export const warden = createWarden({
  issuer,
  clientId,
  redirectUri: `${location.origin}/`,
  postLogoutRedirectUri: `${location.origin}/`,
});

export const isCallback = (search: string) => {
  const params = new URLSearchParams(search);

  return params.has("code") && params.has("state");
};
