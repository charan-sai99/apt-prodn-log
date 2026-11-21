import { requireSession } from "@/lib/auth";
import { navFor } from "@/components/nav-config";
import { MobileNav, Sidebar } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { signOut } from "../(auth)/actions";

const ROLE_LABEL = { operator: "Operator", supervisor: "Supervisor", admin: "Administrator" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const items = navFor(profile.role);
  const roleLabel = ROLE_LABEL[profile.role];
  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} userName={profile.display_name} roleLabel={roleLabel} signOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-navy-900 px-4 py-2.5 pt-safe lg:hidden">
          <Brand inverted compact />
          <div className="text-right leading-tight">
            <p className="max-w-[10rem] truncate text-sm font-semibold text-white">{profile.display_name}</p>
            <p className="text-[11px] text-slate-300">{roleLabel}</p>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>
      </div>
      <MobileNav items={items} userName={profile.display_name} roleLabel={roleLabel} signOut={signOut} />
    </div>
  );
}
