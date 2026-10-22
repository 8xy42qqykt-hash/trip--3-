import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

export interface LightboxPhoto {
  id: string;
  url: string;
}

interface ImageFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PhotoLightboxProps {
  photos?: LightboxPhoto[];
  selectedPhotoId?: string;
  onSelectPhoto?: (photoId: string) => void;
  imageUrl?: string;
  onClose: () => void;
  showCloseButton?: boolean;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos: providedPhotos,
  selectedPhotoId,
  onSelectPhoto,
  imageUrl,
  onClose,
  showCloseButton = true,
}) => {
  const { t } = useLanguage();
  const fallbackPhotos = imageUrl ? [{ id: imageUrl, url: imageUrl }] : [];
  const photos = providedPhotos?.length ? providedPhotos : fallbackPhotos;
  const activePhoto = photos.find((photo) => photo.id === selectedPhotoId) || photos[0];
  const [downloading, setDownloading] = useState(false);
  const [imageFrames, setImageFrames] = useState<Record<string, ImageFrame>>({});
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const programmaticScrollTimer = useRef<number | null>(null);
  const isProgrammaticScroll = useRef(false);

  const measureImage = useCallback((photoId: string, image: HTMLImageElement) => {
    const slide = image.closest<HTMLElement>('[data-photo-id]');
    if (!slide || !image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(slide.clientWidth / image.naturalWidth, slide.clientHeight / image.naturalHeight);
    const frame = {
      left: (slide.clientWidth - image.naturalWidth * scale) / 2,
      top: (slide.clientHeight - image.naturalHeight * scale) / 2,
      width: image.naturalWidth * scale,
      height: image.naturalHeight * scale,
    };
    setImageFrames((current) => {
      const previous = current[photoId];
      if (
        previous
        && Math.abs(previous.left - frame.left) < 1
        && Math.abs(previous.top - frame.top) < 1
        && Math.abs(previous.width - frame.width) < 1
        && Math.abs(previous.height - frame.height) < 1
      ) return current;
      return { ...current, [photoId]: frame };
    });
  }, []);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || !selectedPhotoId) return;
    const selectedSlide = Array.from(carousel.querySelectorAll<HTMLElement>('[data-photo-id]'))
      .find((slide) => slide.dataset.photoId === selectedPhotoId);
    if (!selectedSlide) return;
    const targetLeft = selectedSlide.offsetLeft;
    if (Math.abs(carousel.scrollLeft - targetLeft) < 2) return;

    isProgrammaticScroll.current = true;
    carousel.scrollTo({ left: targetLeft, behavior: 'smooth' });
    if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 500);
  }, [photos, selectedPhotoId]);

  useLayoutEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const observer = new ResizeObserver(() => {
      carousel.querySelectorAll<HTMLImageElement>('[data-photo-image]').forEach((image) => {
        const photoId = image.dataset.photoImage;
        if (photoId) measureImage(photoId, image);
      });
    });
    observer.observe(carousel);
    return () => observer.disconnect();
  }, [measureImage]);

  useEffect(() => () => {
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!onSelectPhoto || photos.length < 2 || !activePhoto) return;
      const index = photos.findIndex((photo) => photo.id === activePhoto.id);
      if (event.key === 'ArrowLeft') onSelectPhoto(photos[(index - 1 + photos.length) % photos.length].id);
      if (event.key === 'ArrowRight') onSelectPhoto(photos[(index + 1) % photos.length].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePhoto, onClose, onSelectPhoto, photos]);

  const downloadPhoto = async (photo: LightboxPhoto) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error(`Photo download failed (${response.status}).`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `trip-photo-${photo.id}.jpg`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('Could not download trip photo:', error);
      window.open(photo.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  const handleCarouselScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel || !onSelectPhoto || isProgrammaticScroll.current) return;
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
      const nearest = Array.from(carousel.querySelectorAll<HTMLElement>('[data-photo-id]'))
        .reduce<HTMLElement | null>((current, candidate) => {
          if (!current) return candidate;
          const currentDistance = Math.abs(current.getBoundingClientRect().left + current.offsetWidth / 2 - center);
          const candidateDistance = Math.abs(candidate.getBoundingClientRect().left + candidate.offsetWidth / 2 - center);
          return candidateDistance < currentDistance ? candidate : current;
        }, null);
      const photoId = nearest?.dataset.photoId;
      if (photoId && photoId !== activePhoto?.id) onSelectPhoto(photoId);
    }, 180);
  };

  useEffect(() => {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    pinchStartDistance.current = null;
  }, [activePhoto?.id]);

  const handlePinchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.photoId !== activePhoto?.id) return;
    if (event.touches.length === 1 && zoomScale > 1) {
      const touch = event.touches[0];
      panStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        offsetX: zoomOffset.x,
        offsetY: zoomOffset.y,
      };
      return;
    }
    if (event.touches.length !== 2) return;
    const [first, second] = Array.from(event.touches);
    pinchStartDistance.current = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    pinchStartScale.current = zoomScale;
    panStart.current = null;
  };

  const handlePinchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.photoId !== activePhoto?.id) return;
    if (event.touches.length === 2 && pinchStartDistance.current !== null) {
      event.preventDefault();
      const [first, second] = Array.from(event.touches);
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      setZoomScale(Math.min(4, Math.max(1, pinchStartScale.current * distance / pinchStartDistance.current)));
      return;
    }
    if (event.touches.length === 1 && zoomScale > 1 && panStart.current) {
      event.preventDefault();
      const touch = event.touches[0];
      setZoomOffset({
        x: panStart.current.offsetX + touch.clientX - panStart.current.x,
        y: panStart.current.offsetY + touch.clientY - panStart.current.y,
      });
    }
  };

  const handlePinchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.photoId !== activePhoto?.id) return;
    if (event.touches.length < 2) pinchStartDistance.current = null;
    if (event.touches.length === 0) {
      panStart.current = null;
      if (zoomScale <= 1) setZoomOffset({ x: 0, y: 0 });
    }
  };

  if (!activePhoto) return null;

  return (
    <motion.div
      data-no-edge-swipe
      className="fixed inset-0 z-[11000] overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      {showCloseButton && (
        <button
          type="button"
          aria-label={t('Close photo')}
          onClick={onClose}
          className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+4rem)] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-xl"
        >
          <X size={21} weight="bold" />
        </button>
      )}

      <div
        ref={carouselRef}
        onScroll={handleCarouselScroll}
        className="photo-main-carousel absolute inset-0 z-[2] flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        style={{
          scrollbarWidth: 'none',
          touchAction: 'pan-x pan-y',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)',
        }}
      >
        {photos.map((photo, index) => {
          const frame = imageFrames[photo.id];
          const photoIndex = photos.findIndex((entry) => entry.id === activePhoto.id);
          const isAdjacent = Math.abs(index - photoIndex) <= 1;
          const isActive = photo.id === activePhoto.id;
          const slideWidth = carouselRef.current?.clientWidth || frame?.width || 0;
          const slideHeight = carouselRef.current?.clientHeight || frame?.height || 0;
          const displayScale = isActive ? zoomScale : 1;
          return (
            <div
              key={photo.id}
              data-photo-id={photo.id}
              onTouchStart={handlePinchStart}
              onTouchMove={handlePinchMove}
              onTouchEnd={handlePinchEnd}
              onTouchCancel={handlePinchEnd}
              onDoubleClick={() => {
                if (!isActive) return;
                setZoomScale((current) => current > 1 ? 1 : 2);
                setZoomOffset({ x: 0, y: 0 });
              }}
              className="relative flex h-full w-full flex-[0_0_100%] snap-center snap-always items-center justify-center overflow-visible"
              style={{ touchAction: isActive && zoomScale > 1 ? 'none' : 'pan-x pan-y' }}
            >
              {frame && isAdjacent && (
                <>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-0 overflow-hidden bg-black"
                    style={{
                      left: frame.left,
                      top: frame.top - frame.height,
                      width: frame.width,
                      height: frame.height,
                    }}
                  >
                    <img
                      data-photo-image={photo.id}
                      src={photo.url}
                      alt=""
                      className="absolute inset-0 h-full w-full max-w-none object-fill blur-[40px]"
                      style={{ transform: 'scale(1.25, -1.25)' }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-0 overflow-hidden bg-black"
                    style={{
                      left: frame.left,
                      top: frame.top + frame.height,
                      width: frame.width,
                      height: frame.height,
                    }}
                  >
                    <img
                      data-photo-image={photo.id}
                      src={photo.url}
                      alt=""
                      className="absolute inset-0 h-full w-full max-w-none object-fill blur-[40px]"
                      style={{ transform: 'scale(1.25, -1.25)' }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-[1] bg-gradient-to-b from-transparent to-black"
                    style={{
                      left: 0,
                      right: 0,
                      top: frame.top + frame.height,
                      height: `max(50vh, ${Math.round(frame.height * 0.9)}px)`,
                    }}
                  />
                </>
              )}
              <img
                data-photo-image={photo.id}
                src={photo.url}
                alt={t('Shared trip photo')}
                loading={isAdjacent ? 'eager' : 'lazy'}
                onLoad={(event) => measureImage(photo.id, event.currentTarget)}
                className="pointer-events-none relative z-[2] block h-full w-full select-none object-contain"
                style={{
                  transform: isActive && zoomScale > 1
                    ? `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`
                    : undefined,
                  transition: 'transform 120ms ease-out',
                }}
                draggable={false}
              />
              {isActive && frame && (
                <button
                  type="button"
                  aria-label={t('Download photo')}
                  onClick={() => void downloadPhoto(photo)}
                  disabled={downloading}
                  className="absolute z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-xl backdrop-blur-xl active:scale-95 disabled:opacity-60"
                  style={{
                    left: slideWidth / 2
                      + (frame.left + frame.width - slideWidth / 2) * displayScale
                      + (isActive ? zoomOffset.x : 0) - 60,
                    top: slideHeight / 2
                      + (frame.top + frame.height - slideHeight / 2) * displayScale
                      + (isActive ? zoomOffset.y : 0) - 60,
                  }}
                >
                  <DownloadSimple size={21} weight="bold" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
