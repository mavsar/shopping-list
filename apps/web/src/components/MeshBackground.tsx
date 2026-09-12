import { useEffect, useId, type CSSProperties } from 'react';
import { Gradient } from 'whatamesh';

/** Pale food tints — the mesh blends them at full strength, so keep them close to paper. */
const MESH_COLORS = {
  '--gradient-color-1': '#fbf7f0', // paper
  '--gradient-color-2': '#fff0c4', // butter
  '--gradient-color-3': '#dcefe2', // basil
  '--gradient-color-4': '#fde3cc', // carrot
} as CSSProperties;

/** Stripe-style WebGL mesh gradient (whatamesh), tinted with the app palette. */
export function MeshBackground() {
  const canvasId = `mesh-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const gradient = new Gradient() as Gradient & { disconnect?: () => void };
    gradient.initGradient(`#${canvasId}`);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const frame = requestAnimationFrame(() => {
      if (reducedMotion.matches) gradient.pause();
    });
    return () => {
      cancelAnimationFrame(frame);
      gradient.disconnect?.();
    };
  }, [canvasId]);

  return (
    <canvas
      id={canvasId}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={MESH_COLORS}
      data-transition-in
    />
  );
}
