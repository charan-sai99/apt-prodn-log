import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
      <WifiOff className="size-10 text-muted" aria-hidden />
      <h1 className="text-xl font-bold text-navy-900">No connection</h1>
      <p className="max-w-xs text-sm text-muted">
        Production entries are saved directly to the server, so you need a network connection. Reconnect and try again.
      </p>
    </main>
  );
}
