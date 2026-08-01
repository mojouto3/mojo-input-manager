import { motion } from 'framer-motion';

const variants = {
  primary:
    'bg-[linear-gradient(135deg,#3ddb3d,#28a428)] text-mim-bg font-semibold shadow-[0_4px_20px_-4px_rgba(61,219,61,0.6)]',
  secondary: 'glass-surface text-white'
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
