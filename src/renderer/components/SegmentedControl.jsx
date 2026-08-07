import { motion } from 'framer-motion';

// A filled, spring-animated pill selector, the same layoutId/spring technique
// Tabs.jsx already uses for its sliding underline, just as a solid indicator
// instead of an underline. Used wherever a handful of mutually-exclusive
// options should be visible and switchable at a glance, no popup needed.
// `layoutId` must be unique per rendered instance, otherwise multiple
// SegmentedControls on screen at once would animate as if they were the same
// element.
export default function SegmentedControl({ options, value, onChange, layoutId }) {
  return (
    <div className="glass-surface inline-flex flex-wrap gap-1 rounded-lg p-1">
      {options.map((opt) => {
        const active = String(opt.value) === String(value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? 'text-mim-bg' : 'text-mim-muted hover:text-white'
            }`}
          >
            {active && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-mim-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
