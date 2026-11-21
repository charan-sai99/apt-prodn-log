import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "APT Production Log", template: "%s · APT Production Log" },
  description: "Hourly machine production logging for Axis Plastics Transition",
  applicationName: "APT Production Log",
  appleWebApp: { capable: true, title: "APT Prod Log", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
