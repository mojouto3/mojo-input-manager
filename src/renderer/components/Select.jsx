import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function Select({ value, onChange, options, placeholder = 'Select...', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const buttonRef = useRef(null);
  const popupRef = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value));

  const MENU_MARGIN = 8;

  function openMenu() {
    if (disabled) return;
    setRect(buttonRef.current.getBoundingClientRect());
    setOpen(true);
  }

  // Opens downward when there's reasonable room below the trigger, otherwise
  // flips above it. Either way the menu's own max-height is clamped to
  // whatever space is actually available and scrolls internally, so it can
  // never render past the edge of a small window with no way to reach it
  // (the app's own body never scrolls, see index.css, so an overflowing
  // fixed-position popup used to just get cut off outside the window).
  // 280px is a hard cap, not just "whatever fits": a 30+ option list should
  // always scroll internally rather than growing to fill all available
  // window height, a popup that tall is bad UX even when it technically fits.
  const MENU_MAX_HEIGHT = 280;

  function menuPlacement() {
    if (!rect) return null;
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
      return { top: rect.bottom + 6, maxHeight: Math.min(MENU_MAX_HEIGHT, Math.max(120, spaceBelow)) };
    }
    return { bottom: window.innerHeight - rect.top + 6, maxHeight: Math.min(MENU_MAX_HEIGHT, Math.max(120, spaceAbove)) };
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (buttonRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    // Scrolling *inside* the popup's own (possibly long) option list also
    // fires a window-level capture-phase "scroll" event, only close on a
    // real page/ancestor scroll, not the popup scrolling itself.
    function handleReposition(e) {
      if (popupRef.current?.contains(e.target)) return;
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
        className={`glass-surface flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-50 ${className}`}
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
              style={{
                position: 'fixed',
                left: rect.left,
                minWidth: rect.width,
                zIndex: 1000,
                overflowY: 'auto',
                ...menuPlacement()
              }}
              className="glass-panel rounded-lg py-1"
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
