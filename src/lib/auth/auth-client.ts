import { createAuthClient } from "better-auth/react";

// No baseURL: the client calls the origin the page was served from, so any of
// the deployment's URLs works without a cross-origin request.
export const authClient = createAuthClient();
