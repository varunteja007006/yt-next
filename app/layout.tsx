import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cliproom | YouTube metadata workspace",
  description: "Browse metadata and download formats from a local YouTube library.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
