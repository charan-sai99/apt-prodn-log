import type { Role } from "@/lib/types";

export type IconName =
  | "plus" | "history" | "wrench" | "dashboard" | "table" | "report" | "check" | "audit"
  | "users" | "factory" | "box" | "link" | "settings";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  mobile?: boolean; // shown in the bottom bar
}

export function navFor(role: Role): NavItem[] {
  if (role === "operator") {
    return [
      { href: "/entry", label: "Log production", icon: "plus", mobile: true },
      { href: "/history", label: "My history", icon: "history", mobile: true },
      { href: "/my-corrections", label: "Corrections", icon: "wrench", mobile: true },
    ];
  }
  const staff: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", mobile: true },
    { href: "/records", label: "Records", icon: "table", mobile: true },
    { href: "/reports", label: "Reports", icon: "report", mobile: true },
    { href: "/corrections", label: "Corrections", icon: "check", mobile: true },
    { href: "/audit", label: "Audit log", icon: "audit" },
  ];
  if (role === "admin") {
    staff.push(
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/assignments", label: "Assignments", icon: "link" },
      { href: "/admin/machines", label: "Machines", icon: "factory" },
      { href: "/admin/components", label: "Components", icon: "box" },
      { href: "/admin/settings", label: "Shifts & settings", icon: "settings" },
    );
  }
  return staff;
}
