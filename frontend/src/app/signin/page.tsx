import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

// AuthForm reads the ?next= param, so it must sit under a Suspense boundary —
// useSearchParams opts the subtree into client rendering.
export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
