import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadTrailPro | Sales workspace",
  description: "A clear, connected workspace for managing leads, follow-ups, and sales performance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
