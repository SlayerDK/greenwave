"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import { useRouter } from "next/navigation";

export const SignOutButton = () => {
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button size="sm" variant="outline" onClick={signOut}>
      Sign out
    </Button>
  );
};
