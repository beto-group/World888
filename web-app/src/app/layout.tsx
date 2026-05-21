import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "World 888 Web",
  description: "Next.js Web Client for World 888",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, boxSizing: "border-box" }}>
        {children}
      </body>
    </html>
  );
}
