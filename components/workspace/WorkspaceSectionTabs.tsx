import React from 'react';
import type { WorkspaceSectionDefinition } from '../../types';

interface WorkspaceSectionTabsProps<T extends string = string> {
  sections: WorkspaceSectionDefinition<T>[];
  activeSection: T;
  onSelect: (section: T) => void;
  className?: string;
}

const WorkspaceSectionTabs = <T extends string>({
  sections,
  activeSection,
  onSelect,
  className = '',
}: WorkspaceSectionTabsProps<T>) => (
  <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
    {sections.map((section) => (
      <button
        key={section.id}
        type="button"
        onClick={() => onSelect(section.id)}
        data-testid={`workspace-tab-${section.id.toLowerCase()}`}
        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
          activeSection === section.id
            ? 'border-medace-700 bg-medace-700 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
        }`}
        aria-pressed={activeSection === section.id}
      >
        <span>{section.label}</span>
        {section.shortLabel && <span className={`text-[11px] ${activeSection === section.id ? 'text-white/75' : 'text-slate-400'}`}>{section.shortLabel}</span>}
      </button>
    ))}
  </div>
);

export default WorkspaceSectionTabs;
