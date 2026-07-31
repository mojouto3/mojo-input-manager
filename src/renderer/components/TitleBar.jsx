import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import logoMark from '../../../assets/icon.svg';

const controls = typeof window !== 'undefined' ? window.mim?.windowControls : undefined;

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    controls.isMaximized().then(setIsMaximized);
    return controls.onMaximizedChange(setIsMaximized);
  }, []);

  return (
    <div className="drag-region flex h-9 shrink-0 items-center justify-between border-b border-mim-border bg-mim-surface pl-3">
      <div className="flex items-center gap-2">
        <img src={logoMark} alt="" className="h-4 w-4" />
        <span className="text-xs font-medium text-mim-muted">Mojo Input Manager</span>
      </div>
      <div className="no-drag flex h-full">
        <button
          onClick={() => controls?.minimize()}
          className="flex h-full w-11 items-center justify-center text-mim-muted transition-colors hover:bg-mim-surface-light hover:text-white"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => controls?.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center text-mim-muted transition-colors hover:bg-mim-surface-light hover:text-white"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={() => controls?.close()}
          className="flex h-full w-11 items-center justify-center text-mim-muted transition-colors hover:bg-red-600 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
