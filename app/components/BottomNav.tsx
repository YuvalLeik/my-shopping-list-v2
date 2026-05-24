"use client";

type Tab = "list" | "history" | "suggestions" | "dashboard";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  itemCount: number;
  historyCount: number;
  suggestionCount: number;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  itemCount,
  historyCount,
  suggestionCount,
}: BottomNavProps) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: "list",
      label: "רשימה",
      count: itemCount,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: "suggestions",
      label: "הצעות",
      count: suggestionCount,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      id: "history",
      label: "היסטוריה",
      count: historyCount,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "dashboard",
      label: "מחירים",
      count: 0,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-sm lg:hidden">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? "text-blue-600"
                : "text-gray-400 active:text-gray-600"
            }`}
          >
            {tab.icon}
            <span className="font-medium">{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`absolute top-1 right-1/2 translate-x-4 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                  activeTab === tab.id ? "bg-blue-500" : "bg-gray-400"
                }`}
              >
                {tab.count > 99 ? "99+" : tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Safe area for devices with home bar */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
