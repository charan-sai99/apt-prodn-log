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
