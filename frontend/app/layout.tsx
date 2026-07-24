import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./globals.css";
import type { ReactNode } from "react";
import CommandBar from "@/components/CommandBar";
import DebugDrawer from "@/components/DebugDrawer";

export const metadata = {
  title: "CareerStack",
  description: "CareerStack — AI coding with trust. Scoped changes, protected paths, real verification.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <CommandBar />
        {children}
        <DebugDrawer />
      </body>
    </html>
  );
}
