import React from 'react';

interface ResponsiveMetricRailProps {
  items: Array<{
    id: string;
    label: string;
    value: string;
    helper?: string;
  }>;
  className?: string;
}

const ResponsiveMetricRail: React.FC<ResponsiveMetricRailProps> = ({ items, className = '' }) => (
  <div className={`md:grid md:grid-cols-3 md:gap-3 ${className}`}>
    <div className="flex gap-3 overflow-x-auto pb-2 md:contents">
      {items.map((item) => (
        <div
          key={item.id}
          className="min-w-[148px] shrink-0 rounded-2xl border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm md:min-w-0"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">{item.label}</div>
          <div className="mt-2 text-3xl font-black text-white">{item.value}</div>
          {item.helper && <div className="mt-1 text-sm text-white/68">{item.helper}</div>}
        </div>
      ))}
    </div>
  </div>
);

export default ResponsiveMetricRail;
