import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "colton.boo",
  description: "Interactive WebGPU experiments powered by vGPU.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
