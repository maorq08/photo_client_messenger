import './ResizeHandle.css';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
}

export default function ResizeHandle({
  direction,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}: ResizeHandleProps) {
  return (
    <div
      className={`resize-handle resize-handle-${direction}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      tabIndex={0}
    />
  );
}
