"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes, ClipboardCheck, Factory, FileSpreadsheet, History, LayoutDashboard, Link2,
  LogOut, Menu, PlusCircle, ScrollText, Settings, Table2, Users, Wrench,
} from "lucide-react";
import type { NavItem, IconName } from "./nav-config";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { Dialog, DialogContent, DialogTrigger } from "./ui/dialog";

const ICONS: Record<IconName, React.ComponentType<{ className?: string }>> = {
  plus: PlusCircle, history: History, wrench: Wrench, dashboard: LayoutDashboard, table: Table2,
  report: FileSpreadsheet, check: ClipboardCheck, audit: ScrollText, users: Users, factory: Factory,
  box: Boxes, link: Link2, settings: Settings,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface Props {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  signOut: () => Promise<void>;
}

export function Sidebar({ items, userName, roleLabel, signOut }: Props) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-navy-900 text-slate-200 lg:flex">
      <div className="border-b border-white/10 p-5">
        <Brand inverted />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                active ? "bg-brand text-white" : "hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">{userName}</p>
        <p className="text-xs text-slate-400">{roleLabel}</p>
        <form action={signOut} className="mt-3">
          <button className="flex items-center gap-2 text-sm text-slate-300 hover:text-white" type="submit">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileNav({ items, userName, roleLabel, signOut }: Props) {
  const pathname = usePathname();
  const primary = items.filter((i) => i.mobile).slice(0, 4);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {primary.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-brand" : "text-muted",
                )}
              >
                <Icon className="size-6" />
                {item.label}
              </Link>
            </li>
          );
        })}
          <li className="flex-1">
            <Dialog>
              <DialogTrigger className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted">
                <Menu className="size-6" /> Menu
              </DialogTrigger>
              <DialogContent title={userName} description={roleLabel}>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const Icon = ICONS[item.icon];
                    return (
                      <li key={item.href}>
                        <Link href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-3 font-medium hover:bg-slate-100">
                          <Icon className="size-5 text-muted" /> {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <form action={signOut} className="mt-4 border-t border-line pt-4">
                  <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 font-medium text-danger hover:bg-danger-50">
                    <LogOut className="size-5" /> Sign out
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          </li>
      </ul>
    </nav>
  );
}

