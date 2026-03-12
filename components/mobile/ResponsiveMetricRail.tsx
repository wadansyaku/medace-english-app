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
  <div className={`min-w-0 md:grid md:grid-cols-3 md:gap-3 ${className}`}>
    <div className="grid min-w-0 grid-cols-3 gap-2.5 pb-2 md:contents">
      {items.map((item) => (
        <div
          key={item.id}
          className="min-w-0 rounded-2xl border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-sm md:px-4 md:py-4"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">{item.label}</div>
          <div className="mt-1.5 break-words text-[1.45rem] font-black leading-none text-white md:mt-2 md:text-3xl">{item.value}</div>
          {item.helper && <div className="mt-0.5 text-[11px] text-white/68 md:mt-1 md:text-sm">{item.helper}</div>}
        </div>
      ))}
    </div>
  </div>
);

export default ResponsiveMetricRail;
