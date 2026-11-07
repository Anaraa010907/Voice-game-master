import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A scrolling list that says when it does not fit: the bottom edge fades out and a small
 * "↓ N more" pill counts the items (direct children) that are cut off or below the fold.
 * Tapping the pill scrolls down. Nothing extra shows while everything fits.
 */
export function ScrollCue({ className, wrapClassName = '', label, children, as: Tag = 'div', ariaLabel, focusKey }: {
  className: string;
  wrapClassName?: string;
  label: (hidden: number) => string;
  children: ReactNode;
  as?: 'div' | 'aside' | 'ol';
  ariaLabel?: string;
  /** When this changes, the child marked `data-cue-focus` is scrolled into view (e.g. the player whose turn it is). */
  focusKey?: string | number | null;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [below, setBelow] = useState(0);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const update = () => {
      const frame = box.getBoundingClientRect();
      let hidden = 0;
      const overflows = box.scrollHeight > box.clientHeight + 1;
      for (const child of Array.from(box.children)) {
        const rect = child.getBoundingClientRect();
        if (overflows && rect.height && rect.bottom > frame.bottom + 2) hidden += 1;
      }
      setBelow(hidden);
      setAbove(box.scrollTop > 2);
    };
    update();
    box.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(box);
    Array.from(box.children).forEach((child) => observer?.observe(child));
    return () => { box.removeEventListener('scroll', update); observer?.disconnect(); };
  });

  useEffect(() => {
    const box = ref.current;
    const target = box?.querySelector<HTMLElement>(':scope > [data-cue-focus]');
    if (!box || !target) return;
    // Keep the target clear of the faded strip and the pill at the bottom (about 30 px).
    const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + target.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight - 36) box.scrollTop = bottom - box.clientHeight + 38;
  }, [focusKey]);

  const more = () => {
    const box = ref.current;
    if (!box) return;
    // Jump instead of gliding when the player asked for less motion (system setting or the in-app switch).
    const still = document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ top: Math.max(40, box.clientHeight * 0.7), behavior: still ? 'auto' : 'smooth' });
  };
  return <div className={`scroll-cue ${wrapClassName} ${below ? 'has-more' : ''} ${above ? 'is-scrolled' : ''}`}>
    <Tag ref={ref as never} className={className} aria-label={ariaLabel}>{children}</Tag>
    {below > 0 && <button type="button" className="scroll-cue-more" onClick={more}><ChevronDown size={12} aria-hidden="true" />{label(below)}</button>}
  </div>;
}
