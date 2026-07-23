import { Button } from "../ui/Button.js";
import { tokens } from "../../lib/tokens.js";

// Hero section for the landing page.
export function Hero() {
  const wrap = `max-width:${tokens.maxWidth};margin:0 auto;padding:96px 24px;text-align:center`;
  return `
    <section class="hero" style="${wrap}">
      <h1 style="font-size:44px;line-height:1.1;margin:0 0 16px">The operating system for your career.</h1>
      <p style="font-size:18px;color:${tokens.colors.muted};margin:0 0 32px">
        CareerOS turns your work into a living graph — and ships changes to it safely.
      </p>
      ${Button("Get started", "/signup")}
    </section>`;
}
