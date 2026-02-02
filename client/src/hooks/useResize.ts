import { useCallback, useEffect, useRef } from 'react';

export interface UseResizeOptions {
  direction: 'horizontal' | 'vertical';
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  containerRef: React.RefObject<HTMLElement>;
}

export function useResize({
  direction,
  min,
  max,
  value,
  onChange,
  containerRef,
}: UseResizeOptions) {
  const isDraggingRef = useRef(false);
  const startValueRef = useRef(value);
  const startPosRef = useRef(0);

  const clamp = useCallback((val: number) => Math.min(max, Math.max(min, val)), [min, max]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    startValueRef.current = value;
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;

    // Add body class for cursor
    document.body.classList.add(direction === 'horizontal' ? 'resizing-horizontal' : 'resizing-vertical');
  }, [direction, value]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;

    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPosRef.current;

    let newValue: number;
    if (direction === 'horizontal') {
      // For horizontal, we're resizing width in pixels
      newValue = startValueRef.current + delta;
    } else {
      // For vertical, we're resizing height as percentage
      const container = containerRef.current;
      if (!container) return;
      const containerHeight = container.getBoundingClientRect().height;
      const deltaPercent = (delta / containerHeight) * 100;
      newValue = startValueRef.current + deltaPercent;
    }

    onChange(clamp(newValue));
  }, [direction, onChange, clamp, containerRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    isDraggingRef.current = false;

    // Remove body class
    document.body.classList.remove('resizing-horizontal', 'resizing-vertical');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('resizing-horizontal', 'resizing-vertical');
    };
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
