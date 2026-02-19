import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function Resizer({ direction, onResize, className }: ResizerProps) {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    let lastPos = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
      if (lastPos !== 0) {
        const delta = currentPos - lastPos;
        onResize(delta);
      }
      lastPos = currentPos;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      lastPos = 0;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, direction, onResize]);

  return (
    <div
      className={cn(
        'resizer',
        direction === 'horizontal' ? 'resizer-horizontal' : '',
        isResizing && 'resizing',
        className
      )}
      onMouseDown={handleMouseDown}
    />
  );
}
