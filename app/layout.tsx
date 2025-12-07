import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Multimodal Prompt Testing",
  description:
    "Compare, cross-evaluate, and rank responses from multiple multimodal AI models.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
