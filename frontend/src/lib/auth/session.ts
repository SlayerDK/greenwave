import "server-only";

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { unauthorized } from "next/navigation";

export const getSession = async () =>
  auth.api.getSession({ headers: await headers() });

export const requireAuth = async () => {
  const session = await getSession();
  if (!session) unauthorized();

  return session;
};
