"use client";

/**
 * Sign in with Apple.
 *
 * Uses Apple's own JS SDK in popup mode, which returns the ID token straight to
 * the page — no redirect, no server-side callback, and no client secret, since
 * nothing here exchanges an authorization code.
 *
 * Two Apple-specific things shape this component:
 *
 *  - **The name arrives once, and only once.** Apple includes `user.name` on the
 *    very first authorization and never again, and it is NOT inside the signed
 *    token. It is passed along as an unverified hint that the backend may only
 *    use to fill a blank name.
 *  - **`localhost` is rejected.** Apple will not accept it as a domain or return
 *    URL, so this button cannot be exercised in local development — only on the
 *    real domain.
 *
 * Renders nothing when NEXT_PUBLIC_APPLE_CLIENT_ID is unset.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

const CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const SDK_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

interface AppleAuthResponse {
  authorization?: { id_token?: string };
  user?: { name?: { firstName?: string; lastName?: string } };
}

interface AppleID {
  auth: {
    init(config: Record<string, unknown>): void;
    signIn(): Promise<AppleAuthResponse>;
  };
}

declare global {
  interface Window {
    AppleID?: AppleID;
  }
}

export default function AppleAuthButton({
  mode,
  onCredential,
  onError,
  disabled,
}: {
  mode: "signin" | "signup";
  onCredential: (credential: string, fullName: string) => void;
  onError: (message?: string) => void;
  disabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Apple's SDK is a singleton; init must not run twice on a re-render.
  const initialised = useRef(false);

  const init = useCallback(() => {
    if (initialised.current || !window.AppleID || !CLIENT_ID) return;
    window.AppleID.auth.init({
      clientId: CLIENT_ID,
      scope: "name email",
      // Required by the SDK even in popup mode, where it is never navigated to.
      // Must exactly match a Return URL registered on the Services ID.
      redirectURI: `${window.location.origin}/signin`,
      usePopup: true,
    });
    initialised.current = true;
    setReady(true);
  }, []);

  // The script may already be cached from a previous page in the session, in
  // which case Script's onLoad never fires.
  useEffect(() => {
    if (window.AppleID) init();
  }, [init]);

  const handleClick = useCallback(async () => {
    if (!window.AppleID || busy) return;
    setBusy(true);
    try {
      const res = await window.AppleID.auth.signIn();
      const token = res.authorization?.id_token;
      if (!token) return onError();

      const name = [res.user?.name?.firstName, res.user?.name?.lastName]
        .filter(Boolean)
        .join(" ");
      onCredential(token, name);
    } catch (err) {
      // The SDK rejects with { error: "popup_closed_by_user" } when the user
      // simply backs out, which is not worth an error toast.
      const code = (err as { error?: string })?.error;
      if (code === "popup_closed_by_user") return;
      onError();
    } finally {
      setBusy(false);
    }
  }, [busy, onCredential, onError]);

  if (!CLIENT_ID) return null;

  return (
    <>
      <Script src={SDK_SRC} strategy="afterInteractive" onLoad={init} />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy || !ready}
        className="
          w-[320px] max-w-full h-10 rounded-full
          flex items-center justify-center gap-2
          bg-black text-white text-sm font-medium
          border border-white/25
          hover:bg-[#151515] transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
        "
      >
        {/* Apple's mark, per their Human Interface Guidelines: white on black,
            sized to the label's cap height. */}
        <svg viewBox="0 0 384 512" width="15" height="15" fill="currentColor" aria-hidden="true">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        </svg>
        {mode === "signup" ? "Sign up with Apple" : "Sign in with Apple"}
      </button>
    </>
  );
}
