import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Box = { left: number; top: number; below: boolean };

export function Hint({ text, children }: { text: string; children: ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);

  function show(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const below = rect.top < 72;
    const width = Math.min(288, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setBox({ left, top: below ? rect.bottom + 6 : rect.top - 6, below });
  }

  return (
    <span
      className="hint"
      data-hint={text}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setBox(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setBox(null)}
    >
      {children}
      {box
        ? createPortal(
            <span
              className="hint-pop"
              role="tooltip"
              style={{
                left: box.left,
                top: box.top,
                transform: box.below ? undefined : 'translateY(-100%)',
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
