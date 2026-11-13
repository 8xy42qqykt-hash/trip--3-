import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

type LiquidGlassProps<T extends React.ElementType = 'div'> = {
  as?: T;
  radius?: number;
  strength?: number;
  aberration?: number;
  tint?: string;
  className?: string;
  refCallback?: (element: HTMLElement | null) => void;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

interface ElementSize {
  width: number;
  height: number;
}

const isChromium = typeof navigator !== 'undefined'
  && Boolean((navigator as Navigator & { userAgentData?: { brands: Array<{ brand: string }> } })
    .userAgentData?.brands.some(({ brand }) => brand === 'Chromium'));

function createDisplacementMap(width: number, height: number, radius: number) {
  if (typeof document === 'undefined') return '';
  const band = Math.max(1, Math.min(width, height) * 0.16);
  const roundedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the Liquid Glass displacement map.');
  const image = context.createImageData(width, height);
  image.data.fill(128);
  for (let index = 3; index < image.data.length; index += 4) image.data[index] = 255;
  const centerX = width / 2;
  const centerY = height / 2;
  const halfWidth = centerX - roundedRadius;
  const halfHeight = centerY - roundedRadius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localX = x + 0.5 - centerX;
      const localY = y + 0.5 - centerY;
      const qx = Math.abs(localX) - halfWidth;
      const qy = Math.abs(localY) - halfHeight;
      const outsideX = Math.max(qx, 0);
      const outsideY = Math.max(qy, 0);
      const outsideLength = Math.hypot(outsideX, outsideY);
      const signedDistance = outsideLength + Math.min(Math.max(qx, qy), 0) - roundedRadius;
      const depth = 1 - Math.max(0, -signedDistance) / band;
      if (signedDistance > 0 || depth <= 0) continue;

      let normalX = 0;
      let normalY = 0;
      if (outsideLength > 0) {
        normalX = Math.sign(localX) * outsideX / outsideLength;
        normalY = Math.sign(localY) * outsideY / outsideLength;
      } else if (qx > qy) {
        normalX = Math.sign(localX);
      } else {
        normalY = Math.sign(localY);
      }

      const easedDepth = depth * depth * (3 - 2 * depth);
      const index = (y * width + x) * 4;
      image.data[index] = Math.round(128 + normalX * 127 * easedDepth);
      image.data[index + 1] = Math.round(128 + normalY * 127 * easedDepth);
      image.data[index + 2] = 128;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const raster = canvas.toDataURL('image/png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${raster}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function LiquidGlass<T extends React.ElementType = 'div'>({
  as,
  radius = 20,
  strength = 1,
  aberration = 0.8,
  tint = 'rgba(238,242,250,0.12)',
  className = '',
  refCallback,
  children,
  style,
  ...elementProps
}: LiquidGlassProps<T>) {
  const Component = (as || 'div') as React.ElementType;
  const generatedId = useId().replace(/:/g, '');
  const filterId = `lg-filter-${generatedId}`;
  const elementRef = useRef<HTMLElement | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const [prefersFallback, setPrefersFallback] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  });
  const displacementMap = useMemo(
    () => isChromium && !prefersFallback && size.width > 0 && size.height > 0
      ? createDisplacementMap(size.width, size.height, radius)
      : '',
    [size.width, size.height, radius, prefersFallback],
  );
  const useDisplacement = isChromium && !prefersFallback && Boolean(displacementMap);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let frame = 0;
    const updateSize = (width: number, height: number) => {
      const next = { width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) };
      setSize((current) => current.width === next.width && current.height === next.height ? current : next);
    };
    updateSize(element.offsetWidth, element.offsetHeight);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updateSize(element.offsetWidth, element.offsetHeight));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transparencyPreference = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const updatePreference = () => {
      setPrefersFallback(motionPreference.matches || transparencyPreference.matches);
    };
    motionPreference.addEventListener('change', updatePreference);
    transparencyPreference.addEventListener('change', updatePreference);
    return () => {
      motionPreference.removeEventListener('change', updatePreference);
      transparencyPreference.removeEventListener('change', updatePreference);
    };
  }, []);

  const baseScale = Math.max(0, strength) * 56;
  const redScale = baseScale;
  const greenScale = baseScale * Math.max(0, 1 - 0.06 * aberration);
  const blueScale = baseScale * Math.max(0, 1 - 0.12 * aberration);
  const filter = useDisplacement
    ? `url(#${filterId}) blur(5px) saturate(1.08)`
    : 'blur(5px) saturate(1.08)';
  const rootStyle: React.CSSProperties = {
    ...style,
    position: style?.position ?? 'relative',
    borderRadius: style?.borderRadius ?? radius,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
    backgroundColor: tint,
    border: style?.border ?? '1px solid rgba(255,255,255,0.04)',
  };
  const rootProps = {
    ...elementProps,
    ref: (element: HTMLElement | null) => {
      elementRef.current = element;
      refCallback?.(element);
    },
    className: `liquid-glass-host ${className}`.trim(),
    style: rootStyle,
  };

  return (
    <Component {...rootProps}>
      <span className="liquid-glass-content">{children}</span>
      {useDisplacement && (
        <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
          <filter
            id={filterId}
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={displacementMap}
              x="0"
              y="0"
              width={size.width}
              height={size.height}
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={redScale} xChannelSelector="R" yChannelSelector="G" result="red-map" />
            <feColorMatrix in="red-map" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
            <feDisplacementMap in="SourceGraphic" in2="map" scale={greenScale} xChannelSelector="R" yChannelSelector="G" result="green-map" />
            <feColorMatrix in="green-map" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
            <feDisplacementMap in="SourceGraphic" in2="map" scale={blueScale} xChannelSelector="R" yChannelSelector="G" result="blue-map" />
            <feColorMatrix in="blue-map" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
            <feBlend in="red" in2="green" mode="screen" result="red-green"/>
            <feBlend in="red-green" in2="blue" mode="screen"/>
          </filter>
        </svg>
      )}
    </Component>
  );
}
