import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import ResumeEditor from "@/components/ResumeEditor";

export default function ResumePage() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Resume" />
      <MobileNav active="Resume" />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 pb-24 lg:pb-16">
        <h1 className="text-xl font-semibold text-text mb-1">Backend Engineer Resume</h1>
        <p className="text-sm text-secondary mb-8">
          Select any text to get inline AI suggestions — every change shows its reasoning and confidence before you accept it.
        </p>
        <ResumeEditor />
      </main>
    </div>
  );
}
