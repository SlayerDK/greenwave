"use client";

import {
  credentialsSchema,
  type AuthMode,
  type Credentials,
} from "@/app/(auth)/_components/credentials-schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { toInternalRoute } from "@/lib/utils/routes";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const COPY = {
  login: {
    title: "Welcome back",
    description: "Sign in to your GreenWave dashboard.",
    submit: "Sign in",
    prompt: "No account yet? ",
    linkLabel: "Sign up",
    linkHref: "/signup",
    passwordAutoComplete: "current-password",
  },
  signup: {
    title: "Create an account",
    description: "Sign up to start monitoring your devices.",
    submit: "Sign up",
    prompt: "Already have an account? ",
    linkLabel: "Sign in",
    linkHref: "/login",
    passwordAutoComplete: "new-password",
  },
} as const;

type AuthFormProps = {
  mode: AuthMode;
  redirectTo: string;
};

export const AuthForm = ({ mode, redirectTo }: AuthFormProps) => {
  const router = useRouter();
  const copy = COPY[mode];

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const submit = async (values: Credentials) => {
    const { error } = await authenticate(mode, values);
    if (error) {
      toast.error(error.message ?? "Authentication failed");
      return;
    }

    router.push(toInternalRoute(redirectTo));
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(submit)}
        >
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" autoComplete="name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={copy.passwordAutoComplete}
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {copy.submit}
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          {copy.prompt}
          <Link className="underline underline-offset-4" href={copy.linkHref}>
            {copy.linkLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};

const authenticate = (mode: AuthMode, values: Credentials) =>
  mode === "signup"
    ? authClient.signUp.email({
        name: values.name ?? "",
        email: values.email,
        password: values.password,
      })
    : authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
