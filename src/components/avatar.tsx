/* eslint-disable @next/next/no-img-element -- small cached avatars from our own endpoint */
import { avatarColor, avatarUrl, initials } from "@/lib/pin-login";
import { cn } from "@/lib/utils";

export function Avatar({
  id,
  name,
  version,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  version?: number | null;
  size?: number;
  className?: string;
}) {
  const url = avatarUrl(id, version);
  const style = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" width={size} height={size} style={style} loading="lazy" className={cn("shrink-0 rounded-full bg-slate-200 object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: avatarColor(id), fontSize: Math.max(11, size * 0.36) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
    >
      {initials(name)}
    </span>
  );
}

/** Photo + name, used wherever a person appears in lists and tables. */
export function PersonName({
  id,
  name,
  version,
  size = 28,
  className,
  children,
}: {
  id: string | null | undefined;
  name: string | null | undefined;
  version?: number | null;
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  if (!name) return <span className={className}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {id ? <Avatar id={id} name={name} version={version} size={size} /> : null}
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {children}
      </span>
    </span>
  );
}
