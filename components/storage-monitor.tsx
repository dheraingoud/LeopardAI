"use client";

interface StorageCategory {
  label: string;
  sizeMB: number;
  color: string;
  count?: number;
}

interface StorageMonitorProps {
  categories: StorageCategory[];
  totalMB?: number;
}

export function StorageMonitor({
  categories,
  totalMB = 1024,
}: StorageMonitorProps) {
  const usedMB = categories.reduce((sum, c) => sum + c.sizeMB, 0);
  const percentUsed = Math.min(100, (usedMB / totalMB) * 100);

  const isWarning = percentUsed >= 80 && percentUsed < 95;
  const isCritical = percentUsed >= 95;

  const statusColor = isCritical
    ? "#ef4444"
    : isWarning
      ? "#ffb400"
      : "#22c55e";

  const statusLabel = isCritical
    ? "Critical"
    : isWarning
      ? "Warning"
      : "Healthy";

  return (
    <div
      className="rounded-xl border border-white/10 p-4"
      style={{ backgroundColor: "#0a0a0a", color: "#e5e5e5" }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Storage</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${statusColor}22`,
              color: statusColor,
            }}
          >
            {statusLabel}
          </span>
        </div>
        <span className="text-xs" style={{ color: "#a3a3a3" }}>
          {usedMB.toFixed(1)} MB / {totalMB} MB
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative mb-3 h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#1a1a1a" }}>
        {categories.map((cat) => {
          const catPercent = (cat.sizeMB / totalMB) * 100;
          return (
            <div
              key={cat.label}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: `${catPercent}%`,
                height: "100%",
                backgroundColor: cat.color,
              }}
              title={`${cat.label}: ${cat.sizeMB.toFixed(2)} MB`}
            />
          );
        })}
        {/* Subtle glow at fill tip */}
        <div
          className="pointer-events-none absolute top-0 h-3 rounded-full"
          style={{
            left: `${percentUsed}%`,
            width: "2px",
            backgroundColor: statusColor,
            boxShadow: `0 0 6px 1px ${statusColor}`,
            transform: "translateX(-50%)",
          }}
        />
      </div>

      {/* Percentage label */}
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-xs" style={{ color: "#737373" }}>
          {percentUsed.toFixed(1)}% used
        </span>
        {isWarning && (
          <span className="text-xs" style={{ color: "#ffb400" }}>
            Approaching limit — consider clearing old chats
          </span>
        )}
        {isCritical && (
          <span className="text-xs" style={{ color: "#ef4444" }}>
            Storage nearly full — clear chats immediately
          </span>
        )}
      </div>

      {/* Category breakdown */}
      <div className="mb-4 space-y-2">
        {categories.map((cat) => {
          const catPercent = totalMB > 0 ? (cat.sizeMB / totalMB) * 100 : 0;
          return (
            <div key={cat.label} className="flex items-center gap-2">
              {/* Color dot */}
              <div
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "#d4d4d4" }}>
                {cat.label}
              </span>
              {cat.count !== undefined && (
                <span className="text-xs" style={{ color: "#525252" }}>
                  {cat.count.toLocaleString()} items
                </span>
              )}
              <span className="text-xs font-medium" style={{ color: "#a3a3a3" }}>
                {cat.sizeMB.toFixed(2)} MB
                <span className="ml-1" style={{ color: "#525252" }}>
                  ({catPercent.toFixed(1)}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          disabled
          className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-not-allowed"
          style={{
            backgroundColor: "#1c1c1c",
            color: "#525252",
            border: "1px solid #262626",
          }}
          title="Coming soon"
        >
          Clear old chats
        </button>
        <button
          disabled
          className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-not-allowed"
          style={{
            backgroundColor: "#1c1c1c",
            color: "#525252",
            border: "1px solid #262626",
          }}
          title="Coming soon"
        >
          Export all data
        </button>
      </div>
    </div>
  );
}