const tones = {
  muted: 'bg-mim-surface-light text-mim-muted border-mim-border',
  green: 'bg-mim-green/10 text-mim-green border-mim-green/30',
  cyan: 'bg-mim-cyan/10 text-mim-cyan border-mim-cyan/30'
};

export default function Badge({ children, tone = 'muted' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
