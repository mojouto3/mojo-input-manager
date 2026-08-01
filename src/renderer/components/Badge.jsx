const tones = {
  muted: 'bg-mim-surface-light text-mim-muted border-mim-border',
  green: 'bg-mim-green/10 text-mim-green border-mim-green/30 shadow-[0_0_10px_rgba(61,219,61,0.15)]',
  cyan: 'bg-mim-cyan/10 text-mim-cyan border-mim-cyan/30 shadow-[0_0_10px_rgba(61,220,232,0.15)]'
};

export default function Badge({ children, tone = 'muted', className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
