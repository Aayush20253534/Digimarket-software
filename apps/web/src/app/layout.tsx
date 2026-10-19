import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DigiMarket | Agency Workspace",
  description: "Internal agency management platform. Foundation workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
