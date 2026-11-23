import type { Metadata } from "next";
import "./globals.css";
import { DesktopShell } from "@/components/layout/DesktopShell";
import { Providers } from "@/components/providers/Providers";

export const metadata: Metadata = {
  title: "Life OS",
  description: "Desktop Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=JetBrains+Mono:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          <DesktopShell>{children}</DesktopShell>
        </Providers>
      </body>
    </html>
  );
}
