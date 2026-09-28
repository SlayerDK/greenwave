import { AppHeader } from "@/app/(app)/_components/app-header";
import { requireAuth } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAuth();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader userName={user.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">{children}</main>
    </div>
  );
}
