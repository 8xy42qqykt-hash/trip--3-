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
  const [imageFrame, setImageFrame] = useState<ImageFrame | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const programmaticScrollTimer = useRef<number | null>(null);
  const isProgrammaticScroll = useRef(false);

  const measureActiveImage = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel || !activePhoto) return;
    const slide = Array.from(carousel.querySelectorAll<HTMLElement>('[data-photo-id]'))
      .find((element) => element.dataset.photoId === activePhoto.id);
    const image = slide?.querySelector('img');
    if (!slide || !image?.naturalWidth || !image.naturalHeight) return;

    const scale = Math.min(slide.clientWidth / image.naturalWidth, slide.clientHeight / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const slideRect = slide.getBoundingClientRect();
    const nextFrame = {
      left: slideRect.left + (slide.clientWidth - width) / 2,
      top: slideRect.top + (slide.clientHeight - height) / 2,
      width,
      height,
    };
    setImageFrame((current) => (
      current
      && Math.abs(current.left - nextFrame.left) < 1
      && Math.abs(current.top - nextFrame.top) < 1
      && Math.abs(current.width - nextFrame.width) < 1
      && Math.abs(current.height - nextFrame.height) < 1
        ? current
        : nextFrame
    ));
  }, [activePhoto]);

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
    measureActiveImage();
    const carousel = carouselRef.current;
    if (!carousel) return;
    const observer = new ResizeObserver(measureActiveImage);
    observer.observe(carousel);
    return () => observer.disconnect();
  }, [measureActiveImage]);

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
    measureActiveImage();
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
      {imageFrame && (
        <>
          <img
            src={activePhoto.url}
            alt=""
            aria-hidden="true"
            className="pointer-events-none fixed z-0 max-w-none object-fill blur-[40px]"
            style={{
              left: imageFrame.left,
              top: imageFrame.top - imageFrame.height,
              width: imageFrame.width,
              height: imageFrame.height,
              transform: 'scaleY(-1)',
            }}
          />
          <img
            src={activePhoto.url}
            alt=""
            aria-hidden="true"
            className="pointer-events-none fixed z-0 max-w-none object-fill blur-[40px]"
            style={{
              left: imageFrame.left,
              top: imageFrame.top + imageFrame.height,
              width: imageFrame.width,
              height: imageFrame.height,
              transform: 'scaleY(-1)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] bg-gradient-to-b from-transparent to-black"
            style={{ top: imageFrame.top + imageFrame.height }}
          />
        </>
      )}

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
        {photos.map((photo) => (
          <div
            key={photo.id}
            data-photo-id={photo.id}
            className="relative flex h-full w-full flex-[0_0_100%] snap-center snap-always items-center justify-center overflow-hidden"
          >
            <img
              src={photo.url}
              alt={t('Shared trip photo')}
              onLoad={photo.id === activePhoto.id ? measureActiveImage : undefined}
              className="pointer-events-none block h-full w-full select-none object-contain"
              draggable={false}
            />
            {photo.id === activePhoto.id && imageFrame && (
              <button
                type="button"
                aria-label={t('Download photo')}
                onClick={() => void downloadPhoto(photo)}
                disabled={downloading}
                className="absolute z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-xl backdrop-blur-xl active:scale-95 disabled:opacity-60"
                style={{
                  right: `calc((100% - ${imageFrame.width}px) / 2 + 12px)`,
                  bottom: `calc((100% - ${imageFrame.height}px) / 2 + 12px)`,
                }}
              >
                <DownloadSimple size={21} weight="bold" />
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
};
