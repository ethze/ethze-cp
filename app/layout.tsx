import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/index.scss";

export const metadata: Metadata = {
  title: "ethze",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
