import { Button } from "../ui/Button.js";
import { tokens } from "../../lib/tokens.js";

// Closing call-to-action section.
export function CTA() {
  const wrap = `max-width:${tokens.maxWidth};margin:0 auto;padding:64px 24px;text-align:center`;
  return `
    <section class="cta" style="${wrap}">
      <h2 style="font-size:28px;margin:0 0 16px">Ready to build your career graph?</h2>
      ${Button("Start free", "/signup")}
    </section>`;
}
