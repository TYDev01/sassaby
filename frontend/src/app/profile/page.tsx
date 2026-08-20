import { Suspense } from "react";
import ProfilePage from "@/components/ProfilePage";

export default function Profile() {
  return (
    <Suspense>
      <ProfilePage />
    </Suspense>
  );
}
