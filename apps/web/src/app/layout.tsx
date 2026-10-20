import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AmplifyWorld Workspace | Private Agency Operations",
  description: "A secure internal workspace for agency clients, projects, tasks, content planning, finance and approvals.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/amplifyworld-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
