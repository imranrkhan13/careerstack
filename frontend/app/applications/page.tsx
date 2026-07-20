import Sidebar from "@/components/today/Sidebar";
import MobileNav from "@/components/today/MobileNav";
import KanbanBoard from "@/components/applications/KanbanBoard";

export default function ApplicationsPage() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar active="Applications" />
      <MobileNav active="Applications" />
      <KanbanBoard />
    </div>
  );
}
