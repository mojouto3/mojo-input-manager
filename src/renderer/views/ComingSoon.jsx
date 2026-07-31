import { motion } from 'framer-motion';
import Card from '../components/Card';

export default function ComingSoon({ title }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Card hover={false} className="px-10 py-8 text-center">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-mim-muted">This section is coming soon.</p>
        </Card>
      </motion.div>
    </div>
  );
}
