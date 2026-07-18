"use client";

import { ReactNode, useEffect, useRef } from "react";

export function DocumentZoomSurface({ zoom, onZoomChange, children, className }: { zoom: number; onZoomChange: (zoom: number) => void; children: ReactNode; className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoomChange(Math.min(4, Math.max(0.25, Number((zoom + (event.deltaY < 0 ? 0.15 : -0.15)).toFixed(2)))));
    };
    host.addEventListener("wheel", wheel, { passive: false });
    return () => host.removeEventListener("wheel", wheel);
  }, [onZoomChange, zoom]);
  return <div ref={hostRef} className={className}>{children}</div>;
}
