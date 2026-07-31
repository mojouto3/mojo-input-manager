import { motion } from 'framer-motion';
import logoMark from '../../assets/logo-mark-green.svg';

export default function App() {
  return (
    <div className="min-h-screen bg-mim-bg flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center"
      >
        <motion.img
          src={logoMark}
          alt=""
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="h-40 w-auto mx-auto mb-4"
        />
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-5xl font-bold text-mim-green mb-4"
        >
          Mojo Input Manager
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-gray-400 text-lg"
        >
          Setup wizard coming soon
        </motion.p>
      </motion.div>
    </div>
  );
}