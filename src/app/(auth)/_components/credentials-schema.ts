import { z } from "zod";

export const credentialsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type AuthMode = "login" | "signup";
