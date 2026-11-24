import { Users } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { navFor } from "@/components/nav-config";
import { MobileNav, Sidebar } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { IdleSignOut } from "@/components/idle-sign-out";
import { signOut, signOutIdle } from "../(auth)/actions";

const ROLE_LABEL = { operator: "Operator", supervisor: "Supervisor", admin: "Administrator" } as const;
const IDLE_MINUTES = 10;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const items = navFor(profile.role);
  const roleLabel = ROLE_LABEL[profile.role];
  const pinUser = profile.role !== "admin"; // operators & supervisors use photo + PIN on shared phones
  const exitLabel = pinUser ? "Switch user" : "Sign out";
  return (
    <div className="flex min-h-dvh">
      {pinUser && <IdleSignOut minutes={IDLE_MINUTES} action={signOutIdle} />}
      <Sidebar items={items} userName={profile.display_name} roleLabel={roleLabel} signOut={signOut} exitLabel={exitLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-navy-900 px-4 py-2.5 pt-safe lg:hidden">
          <Brand inverted compact />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="max-w-[9rem] truncate text-sm font-semibold text-white">{profile.display_name}</p>
              <p className="text-[11px] text-slate-300">{roleLabel}</p>
            </div>
            <form action={signOut}>
              <button type="submit" className="flex h-11 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white active:bg-white/20" aria-label={exitLabel}>
                <Users className="size-4" /> {pinUser ? "Switch" : "Sign out"}
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>
      </div>
      <MobileNav items={items} userName={profile.display_name} roleLabel={roleLabel} signOut={signOut} exitLabel={exitLabel} />
    </div>
  );
}
