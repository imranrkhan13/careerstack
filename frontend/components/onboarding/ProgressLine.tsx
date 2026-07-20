export default function ProgressLine({ step, total }: { step: number; total: number }) {
  const pct = ((step + 1) / total) * 100;
  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] bg-border z-50">
      <div
        className="h-full bg-signal transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
