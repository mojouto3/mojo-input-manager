import { motion } from 'framer-motion';

export default function Toggle({ checked, onChange, disabled = false, glow = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[18px] w-[34px] shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{
        background: checked ? 'linear-gradient(135deg,#3ddb3d,#2fb82f)' : '#3a3a3a',
        boxShadow: checked ? (glow ? '0 0 12px rgba(61,219,61,0.55)' : '0 0 5px rgba(61,219,61,0.2)') : 'none'
      }}
    >
      <motion.span
        className="absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white"
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
