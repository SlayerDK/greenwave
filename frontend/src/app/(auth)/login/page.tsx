import { AuthForm } from "@/app/(auth)/_components/auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { redirectTo } = await searchParams;

  return (
    <AuthForm
      mode="login"
      redirectTo={typeof redirectTo === "string" ? redirectTo : "/"}
    />
  );
}
