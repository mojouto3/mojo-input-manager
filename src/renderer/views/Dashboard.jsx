import { motion } from 'framer-motion';
import { Gamepad2, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import Card from '../components/Card';
import Badge from '../components/Badge';

const ROADMAP = [
  {
    step: 1,
    icon: Gamepad2,
    title: 'Virtual Devices',
    description: 'Create and configure virtual controllers with vJoy.',
    tone: 'green',
    viewId: 'virtual-devices',
    available: true
  },
  {
    step: 2,
    icon: SlidersHorizontal,
    title: 'Mapping',
    description: 'Map physical devices onto your virtual controllers.',
    tone: 'green',
    viewId: 'mapping',
    available: true
  },
  {
    step: 3,
    icon: ShieldCheck,
    title: 'Device Filtering',
    description: 'Choose exactly which devices each game can see.',
    tone: 'cyan',
    viewId: 'device-filtering',
    available: false
  }
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

export default function Dashboard({ onNavigate }) {
  return (
    <div className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <h1 className="text-3xl font-bold text-white">Welcome back</h1>
        <p className="mt-1 text-mim-muted">
          Set up your controllers once, then choose exactly which ones each game sees.
        </p>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-3">
        {ROADMAP.map(({ step, icon: Icon, title, description, tone, viewId, available }) => (
          <motion.div key={title} variants={item}>
            <Card
              onClick={available ? () => onNavigate(viewId) : undefined}
              className={`flex h-full flex-col gap-3 p-5 ${available ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    tone === 'green' ? 'bg-mim-green/10 text-mim-green' : 'bg-mim-cyan/10 text-mim-cyan'
                  }`}
                >
                  <Icon size={20} />
                </div>
                <span className="text-xs font-semibold text-mim-muted">STEP {step}</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-mim-muted">{description}</p>
              </div>
              <div className="mt-auto pt-2">
                <Badge tone={available ? 'green' : 'muted'}>{available ? 'Available' : 'Coming soon'}</Badge>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
