import { SignOutButton } from "@/app/(app)/_components/sign-out-button";
import Link from "next/link";

export const AppHeader = ({ userName }: { userName: string }) => (
  <header className="border-b">
    <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4">
      <Link className="font-semibold" href="/">
        GreenWave
      </Link>

      <nav className="flex items-center gap-4 text-sm">
        <Link href="/map">Map</Link>
        <Link href="/devices">Devices</Link>
        <span className="text-muted-foreground">{userName}</span>
        <SignOutButton />
      </nav>
    </div>
  </header>
);
