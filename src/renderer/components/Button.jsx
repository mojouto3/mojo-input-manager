import { motion } from 'framer-motion';

const variants = {
  primary: 'bg-mim-green text-mim-bg font-semibold shadow-[0_0_20px_-4px_var(--color-mim-green)]',
  secondary: 'bg-mim-surface-light text-white border border-mim-border'
};

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={`min-w-[132px] justify-center rounded-lg px-5 py-2.5 text-sm transition-colors ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
