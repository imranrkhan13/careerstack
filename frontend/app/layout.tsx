import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
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
