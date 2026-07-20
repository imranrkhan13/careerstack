import { redirect } from "next/navigation";

export default function RootPage() {
  // Today is the product — there is no separate dashboard/marketing home.
  redirect("/today");
}
