import type { Metadata, Viewport } from "next";
import { PWAProvider } from "@/components/pwa-install";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AmplifyWorld Workspace | Private Agency Operations",
  description: "A secure internal workspace for agency clients, projects, tasks, content planning, finance and approvals.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/amplifyworld-mark.svg", type: "image/svg+xml" },
      { url: "/pwa-icon/192?v=white-a-2", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/pwa-icon/180?v=white-a-2", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "AmplifyWorld Workspace", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10091C" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider><PWAProvider>{children}</PWAProvider></AuthProvider></body></html>;
}
