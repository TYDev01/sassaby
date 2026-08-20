"use client";

/**
 * Google sign-in button.
 *
 * Renders Google's own button rather than a custom one: it is an iframe from
 * accounts.google.com, and the credential never passes through our JS on the
 * way out. It also keeps the branding within Google's terms without us having
 * to police the mark ourselves.
 *
 * What comes back is an ID token, not an access token — a signed assertion of
 * who the user is, which the backend verifies against Google's keys. Nothing
 * here is trusted; this component only ferries the token.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, matching
 * ClientProviders, which doesn't mount the provider in that case either. The
 * divider above the social buttons belongs to the caller, which is the only
 * place that knows whether ANY provider is configured.
 */

import { GoogleLogin } from "@react-oauth/google";

const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export default function GoogleAuthButton({
  mode,
  onCredential,
  onError,
  disabled,
}: {
  mode: "signin" | "signup";
  onCredential: (credential: string) => void;
  onError: () => void;
  disabled?: boolean;
}) {
  if (!CONFIGURED) return null;

  return (
    // Google's button is a fixed-width iframe, so it is centred rather than
    // stretched — forcing it to full width just clips the label.
    <div className={`flex justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <GoogleLogin
        onSuccess={(res) => {
          if (res.credential) onCredential(res.credential);
          else onError();
        }}
        onError={onError}
        theme="filled_black"
        shape="pill"
        size="large"
        width="320"
        text={mode === "signup" ? "signup_with" : "signin_with"}
        logo_alignment="left"
      />
    </div>
  );
}
