import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DownloadSimple, X } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';

export interface LightboxPhoto {
  id: string;
  url: string;
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
  const stripRef = useRef<HTMLDivElement>(null);
  const mainCarouselRef = useRef<HTMLDivElement>(null);
  const stripScrollTimer = useRef<number | null>(null);
  const programmaticScrollTimer = useRef<number | null>(null);
  const mainScrollTimer = useRef<number | null>(null);
  const programmaticMainScrollTimer = useRef<number | null>(null);
  const isStripScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const isMainScrollingRef = useRef(false);

  useLayoutEffect(() => {
    if (!selectedPhotoId || !stripRef.current || isStripScrollingRef.current) return;
    const selected = Array.from(stripRef.current.querySelectorAll<HTMLElement>('[data-photo-id]'))
      .find((photo) => photo.dataset.photoId === selectedPhotoId);
    if (!selected) return;
    const strip = stripRef.current;
    const stripRect = strip.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const targetLeft = strip.scrollLeft
      + selectedRect.left + selectedRect.width / 2
      - stripRect.left - strip.clientWidth / 2;
    isProgrammaticScrollRef.current = true;
    strip.scrollTo({ left: targetLeft, behavior: 'smooth' });
    if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 450);
  }, [selectedPhotoId, photos.length]);

  useLayoutEffect(() => {
    const carousel = mainCarouselRef.current;
    if (!carousel || !selectedPhotoId || isMainScrollingRef.current) return;
    const index = photos.findIndex((photo) => photo.id === selectedPhotoId);
    if (index < 0) return;
    const targetLeft = index * carousel.clientWidth;
    if (Math.abs(carousel.scrollLeft - targetLeft) > 2) {
      isMainScrollingRef.current = true;
      carousel.scrollTo({ left: targetLeft, behavior: 'smooth' });
      if (programmaticMainScrollTimer.current !== null) window.clearTimeout(programmaticMainScrollTimer.current);
      programmaticMainScrollTimer.current = window.setTimeout(() => {
        isMainScrollingRef.current = false;
      }, 450);
    }
  }, [selectedPhotoId, photos]);

  useEffect(() => () => {
    if (stripScrollTimer.current !== null) window.clearTimeout(stripScrollTimer.current);
    if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
    if (mainScrollTimer.current !== null) window.clearTimeout(mainScrollTimer.current);
    if (programmaticMainScrollTimer.current !== null) window.clearTimeout(programmaticMainScrollTimer.current);
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

  const downloadPhoto = async () => {
    if (!activePhoto || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(activePhoto.url);
      if (!response.ok) throw new Error(`Photo download failed (${response.status}).`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `trip-photo-${activePhoto.id}.jpg`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('Could not download trip photo:', error);
      window.open(activePhoto.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  const stepPhoto = (direction: number) => {
    if (!onSelectPhoto || !activePhoto || photos.length < 2) return;
    const index = photos.findIndex((photo) => photo.id === activePhoto.id);
    onSelectPhoto(photos[(index + direction + photos.length) % photos.length].id);
  };

  const handleStripScroll = () => {
    const strip = stripRef.current;
    if (!strip || !onSelectPhoto || isProgrammaticScrollRef.current) return;
    isStripScrollingRef.current = true;
    if (stripScrollTimer.current !== null) window.clearTimeout(stripScrollTimer.current);
    stripScrollTimer.current = window.setTimeout(() => {
      isStripScrollingRef.current = false;
      const stripCenter = strip.getBoundingClientRect().left + strip.clientWidth / 2;
      const nearest = Array.from(strip.querySelectorAll<HTMLElement>('[data-photo-id]'))
        .reduce<HTMLElement | null>((current, candidate) => {
          if (!current) return candidate;
          const currentDistance = Math.abs(current.getBoundingClientRect().left + current.offsetWidth / 2 - stripCenter);
          const candidateDistance = Math.abs(candidate.getBoundingClientRect().left + candidate.offsetWidth / 2 - stripCenter);
          return candidateDistance < currentDistance ? candidate : current;
        }, null);
      const photoId = nearest?.dataset.photoId;
      if (photoId && photoId !== activePhoto?.id) onSelectPhoto(photoId);
    }, 140);
  };

  const handleMainScroll = () => {
    const carousel = mainCarouselRef.current;
    if (!carousel || !onSelectPhoto || isMainScrollingRef.current) return;
    if (mainScrollTimer.current !== null) window.clearTimeout(mainScrollTimer.current);
    mainScrollTimer.current = window.setTimeout(() => {
      const index = Math.max(0, Math.min(photos.length - 1, Math.round(carousel.scrollLeft / carousel.clientWidth)));
      const photoId = photos[index]?.id;
      if (photoId && photoId !== activePhoto?.id) onSelectPhoto(photoId);
    }, 100);
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
      <motion.img
        key={`backdrop-${activePhoto.id}`}
        src={activePhoto.url}
        alt=""
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.68 }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-[40px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-1/2 bg-gradient-to-b from-transparent to-black"
      />

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
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' }}
      >
        <div
          ref={mainCarouselRef}
          onScroll={handleMainScroll}
          className="relative flex min-h-0 w-full flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
          style={{ scrollbarWidth: 'none', touchAction: 'pan-x pan-y' }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              data-main-photo-id={photo.id}
              className="relative flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden"
            >
              <img
                src={photo.url}
                alt={t('Shared trip photo')}
                className="block h-full w-full select-none object-contain"
                draggable={false}
              />
            </div>
          ))}
          <button
            type="button"
            aria-label={t('Download photo')}
            onClick={() => void downloadPhoto()}
            disabled={downloading}
            className="pointer-events-auto absolute bottom-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-xl backdrop-blur-xl active:scale-95 disabled:opacity-60"
          >
            <DownloadSimple size={21} weight="bold" />
          </button>
        </div>

        {photos.length > 0 && (
          <div
            ref={stripRef}
            onScroll={handleStripScroll}
            className="photo-filmstrip flex h-[calc(76px+env(safe-area-inset-bottom,0px))] shrink-0 snap-x snap-mandatory items-center gap-2 overflow-x-auto px-[calc(50vw-27px)] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-1"
            style={{
              scrollbarWidth: 'none',
            }}
          >
            {photos.map((photo) => (
              <button
                key={photo.id}
                data-photo-id={photo.id}
                type="button"
                aria-label={t('View shared trip photo')}
                aria-current={photo.id === activePhoto.id}
                onClick={() => onSelectPhoto?.(photo.id)}
                className="h-14 w-14 shrink-0 snap-center overflow-hidden rounded-xl"
              >
                <motion.img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  animate={{
                    scale: photo.id === activePhoto.id ? 1.12 : 0.94,
                    opacity: photo.id === activePhoto.id ? 1 : 0.58,
                  }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full w-full rounded-xl object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
