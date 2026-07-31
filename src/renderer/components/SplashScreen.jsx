import { motion } from 'framer-motion';
import logo from '../../../assets/logo-mark-green.svg';

export default function SplashScreen() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-mim-bg"
    >
      <motion.img
        src={logo}
        alt=""
        className="h-32 w-auto"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </motion.div>
  );
}
