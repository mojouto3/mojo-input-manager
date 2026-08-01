import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function Select({ value, onChange, options, placeholder = 'Select...', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const buttonRef = useRef(null);
  const popupRef = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  function openMenu() {
    if (disabled) return;
    setRect(buttonRef.current.getBoundingClientRect());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (buttonRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function handleReposition() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        className="glass-surface flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        <span className={selected ? 'text-white' : 'text-mim-muted'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={`text-mim-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'fixed', top: rect.bottom + 6, left: rect.left, minWidth: rect.width, zIndex: 1000 }}
              className="glass-panel overflow-hidden rounded-lg py-1"
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-mim-muted">No options available</div>
              ) : (
                options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`block w-full whitespace-nowrap px-3 py-2 text-left text-sm transition-colors ${
                      String(option.value) === String(value)
                        ? 'bg-mim-accent/10 text-mim-accent'
                        : 'text-white hover:bg-white/5'
                    }`}
                  >
                    {option.label}
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
