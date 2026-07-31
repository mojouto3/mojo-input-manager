import { motion } from 'framer-motion';

export default function Card({ children, className = '', hover = true, ...props }) {
  return (
    <motion.div
      className={`rounded-2xl border border-mim-border bg-mim-surface/60 backdrop-blur-sm ${className}`}
      whileHover={hover ? { y: -4, borderColor: 'var(--color-mim-green)' } : undefined}
      transition={{ duration: 0.2 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
