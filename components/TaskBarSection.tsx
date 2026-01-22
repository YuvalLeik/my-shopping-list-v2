'use client';

import { ChevronDown } from 'lucide-react';
import { ReactNode } from 'react';

interface TaskBarSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function TaskBarSection({ title, isExpanded, onToggle, children }: TaskBarSectionProps) {
  return (
    <div className="border-b border-slate-200/50 dark:border-slate-800/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors [dir=rtl]:flex-row-reverse"
      >
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        <ChevronDown
          className={`h-4 w-4 text-slate-600 dark:text-slate-400 transition-transform duration-200 flex-shrink-0 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isExpanded && (
        <div className="overflow-y-auto max-h-[500px] transition-all duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
