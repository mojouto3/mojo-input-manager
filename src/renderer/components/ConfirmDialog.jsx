import { AnimatePresence, motion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';

// A styled stand-in for Electron's native dialog.showMessageBox, so a
// "this can't be undone" confirmation still looks like part of MIM instead
// of a plain OS message box dropped on top of an otherwise fully custom UI.
export default function ConfirmDialog({ open, title, message, detail, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass-panel w-full max-w-sm rounded-2xl p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                <TriangleAlert size={16} />
              </span>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>
            <p className="mb-1 text-sm text-white">{message}</p>
            {detail && <p className="text-xs text-mim-muted">{detail}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="glass-surface rounded-full px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                className="rounded-full border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
