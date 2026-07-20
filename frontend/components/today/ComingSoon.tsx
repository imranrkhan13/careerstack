import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";

export default function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active={title} />
      <MobileNav active={title} />
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-xs font-mono text-muted tracking-wide mb-3">not built yet</p>
          <h1 className="text-xl font-medium text-text mb-2">{title}</h1>
          <p className="text-secondary text-sm">{note}</p>
        </div>
      </main>
    </div>
  );
}
