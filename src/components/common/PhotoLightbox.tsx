import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DownloadSimple, Pause, Play, SpeakerHigh, SpeakerSlash, X } from '@phosphor-icons/react';
import { AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { LiquidGlass } from '../ui/LiquidGlass';
import { useLanguage } from '../../context/LanguageContext';

export interface LightboxPhoto {
  id: string;
  url: string;
  type?: 'image' | 'video';
}

interface ImageFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface VideoFrame {
  photoId: string;
  width: number;
  height: number;
}

interface PhotoLightboxProps {
  photos?: LightboxPhoto[];
  selectedPhotoId?: string;
  initialIndex?: number;
  onSelectPhoto?: (photoId: string) => void;
  imageUrl?: string;
  onClose: () => void;
  showCloseButton?: boolean;
}

const videoPosterCache = new Map<string, string>();

function getThumbnailUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.href);
    const objectPath = '/storage/v1/object/';
    if (!parsed.pathname.includes(objectPath)) return url;
    parsed.pathname = parsed.pathname.replace(objectPath, '/storage/v1/render/image/');
    parsed.searchParams.set('width', '112');
    parsed.searchParams.set('height', '72');
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '45');
    parsed.searchParams.set('format', 'webp');
    return parsed.href;
  } catch {
    return url;
  }
}

const VideoThumbnail: React.FC<{ url: string }> = ({ url }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [poster, setPoster] = useState(() => videoPosterCache.get(url) || '');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || poster) return;
    if (!('IntersectionObserver' in window)) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setIsNearViewport(true);
      observer.disconnect();
    }, { rootMargin: '120px' });
    observer.observe(container);
    return () => observer.disconnect();
  }, [poster]);

  const capturePoster = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (videoPosterCache.has(url)) {
      setPoster(videoPosterCache.get(url) || '');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 112;
      canvas.height = 72;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/webp', 0.55);
      videoPosterCache.set(url, thumbnail);
      setPoster(thumbnail);
      video.pause();
    } catch (error) {
      console.error('Could not create a video thumbnail:', error);
    }
  };

  return (
    <span ref={containerRef} className="relative block h-full w-full overflow-hidden bg-black/50">
      {poster ? (
        <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : isNearViewport ? (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          onLoadedData={capturePoster}
          className="h-full w-full object-cover"
          aria-hidden="true"
        />
      ) : null}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Play size={16} weight="fill" className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
      </span>
    </span>
  );
};

interface PhotoThumbnailProps {
  photo: LightboxPhoto;
  onClick: () => void;
  registerMotionValue: (id: string, value: MotionValue<number>) => () => void;
}

const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ photo, onClick, registerMotionValue }) => {
  const [source, setSource] = useState(() => photo.type === 'video' ? '' : getThumbnailUrl(photo.url));
  const distance = useMotionValue(1);
  const scale = useTransform(distance, (value) => 1 - 0.3 * Math.min(1, Math.abs(value)));
  const opacity = useTransform(distance, (value) => 0.5 + 0.5 * (1 - Math.min(1, Math.abs(value))));

  useEffect(() => registerMotionValue(photo.id, distance), [distance, photo.id, registerMotionValue]);

  return (
    <motion.button
      type="button"
      data-thumbnail-id={photo.id}
      aria-label={`View ${photo.type === 'video' ? 'video' : 'photo'} ${photo.id}`}
      onClick={onClick}
      className="photo-thumbnail flex h-14 w-12 shrink-0 snap-center items-center justify-center overflow-hidden rounded-lg bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{ scale, opacity }}
    >
      {photo.type === 'video' ? (
        <VideoThumbnail url={photo.url} />
      ) : (
        <img
          src={source}
          alt=""
          loading="lazy"
          onError={() => {
            if (source !== photo.url) setSource(photo.url);
          }}
          className="h-full w-full object-cover"
        />
      )}
    </motion.button>
  );
};

function nearestItemId(container: HTMLElement, selector: string, center: number) {
  const nearest = Array.from(container.querySelectorAll<HTMLElement>(selector))
    .reduce<HTMLElement | null>((current, candidate) => {
      if (!current) return candidate;
      const currentDistance = Math.abs(current.getBoundingClientRect().left + current.offsetWidth / 2 - center);
      const candidateDistance = Math.abs(candidate.getBoundingClientRect().left + candidate.offsetWidth / 2 - center);
      return candidateDistance < currentDistance ? candidate : current;
    }, null);
  return nearest?.dataset.photoId || nearest?.dataset.thumbnailId;
}

function scrollItemToCenter(container: HTMLElement, item: HTMLElement, behavior: ScrollBehavior) {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const left = container.scrollLeft + itemRect.left + itemRect.width / 2
    - containerRect.left - container.clientWidth / 2;
  container.scrollTo({ left, behavior });
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photos: providedPhotos,
  selectedPhotoId,
  initialIndex = 0,
  onSelectPhoto,
  imageUrl,
  onClose,
  showCloseButton = true,
}) => {
  const { t } = useLanguage();
  const fallbackPhotos: LightboxPhoto[] = imageUrl ? [{ id: imageUrl, url: imageUrl }] : [];
  const photos = providedPhotos?.length ? providedPhotos : fallbackPhotos;
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, photos.length - 1));
  const activePhoto = photos.find((photo) => photo.id === selectedPhotoId) || photos[safeInitialIndex];
  const [imageFrames, setImageFrames] = useState<Record<string, ImageFrame>>({});
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const [isZoomGestureActive, setIsZoomGestureActive] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPlaybackError, setVideoPlaybackError] = useState('');
  const [playbackIndicator, setPlaybackIndicator] = useState<'play' | null>(null);
  const [videoFrame, setVideoFrame] = useState<VideoFrame | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const pinchStartOffsetRef = useRef({ x: 0, y: 0 });
  const pinchStartMidpointRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const driverRef = useRef<'main' | 'strip' | 'external' | null>(null);
  const initialPlacementRef = useRef(true);
  const skipFirstSelectionSyncRef = useRef(true);
  const driverTimerRef = useRef<number | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const playbackIndicatorTimerRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const mainScrollFrameRef = useRef(0);
  const thumbnailMotionsRef = useRef(new Map<string, MotionValue<number>>());
  const activeIndex = activePhoto ? photos.findIndex((photo) => photo.id === activePhoto.id) : -1;
  const activePhotoId = activePhoto?.id;

  const measureVideoFrame = useCallback(() => {
    const stage = videoStageRef.current;
    const video = videoRef.current;
    if (!activePhotoId || !stage || !video?.videoWidth || !video.videoHeight) return;
    const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    setVideoFrame({
      photoId: activePhotoId,
      width: video.videoWidth * scale,
      height: video.videoHeight * scale,
    });
  }, [activePhotoId]);

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
    setImageFrames((current) => ({ ...current, [photoId]: frame }));
  }, []);

  const updateThumbnailDistances = useCallback(() => {
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const center = strip.getBoundingClientRect().left + strip.clientWidth / 2;
    const items = Array.from(strip.querySelectorAll<HTMLElement>('[data-thumbnail-id]'));
    const spacing = items[0]?.offsetWidth
      ? items[0].offsetWidth + parseFloat(getComputedStyle(strip).columnGap || '8')
      : 56;
    items.forEach((item) => {
      const id = item.dataset.thumbnailId;
      if (!id) return;
      const distance = Math.abs(item.getBoundingClientRect().left + item.offsetWidth / 2 - center) / spacing;
      thumbnailMotionsRef.current.get(id)?.set(distance);
    });
  }, []);

  const registerMotionValue = useCallback((id: string, value: MotionValue<number>) => {
    thumbnailMotionsRef.current.set(id, value);
    return () => {
      if (thumbnailMotionsRef.current.get(id) === value) thumbnailMotionsRef.current.delete(id);
    };
  }, []);

  const scheduleDriverRelease = useCallback((driver: 'main' | 'strip' | 'external') => {
    if (driverTimerRef.current !== null) window.clearTimeout(driverTimerRef.current);
    driverTimerRef.current = window.setTimeout(() => {
      if (driverRef.current === driver) driverRef.current = null;
    }, 240);
  }, []);

  const centerItem = useCallback((
    container: HTMLDivElement | null,
    selector: string,
    id: string,
    behavior: ScrollBehavior,
  ) => {
    if (!container) return;
    const item = Array.from(container.querySelectorAll<HTMLElement>(selector))
      .find((candidate) => (
        candidate.dataset.photoId === id || candidate.dataset.thumbnailId === id
      ));
    if (item) scrollItemToCenter(container, item, behavior);
  }, []);

  useLayoutEffect(() => {
    const id = selectedPhotoId || photos[safeInitialIndex]?.id;
    if (id) {
      centerItem(carouselRef.current, '[data-photo-id]', id, 'instant');
      centerItem(thumbnailStripRef.current, '[data-thumbnail-id]', id, 'instant');
    }
    updateThumbnailDistances();
    initialPlacementRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (skipFirstSelectionSyncRef.current) {
      skipFirstSelectionSyncRef.current = false;
      return;
    }
    if (!activePhoto || initialPlacementRef.current) return;
    const driver = driverRef.current;
    if (driver !== 'main') {
      centerItem(carouselRef.current, '[data-photo-id]', activePhoto.id, 'smooth');
    }
    if (driver !== 'strip') {
      centerItem(thumbnailStripRef.current, '[data-thumbnail-id]', activePhoto.id, 'smooth');
    }
    updateThumbnailDistances();
  }, [activePhoto?.id, centerItem, updateThumbnailDistances]);

  useEffect(() => {
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(updateThumbnailDistances);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [updateThumbnailDistances]);

  useEffect(() => () => {
    if (driverTimerRef.current !== null) window.clearTimeout(driverTimerRef.current);
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    if (playbackIndicatorTimerRef.current !== null) window.clearTimeout(playbackIndicatorTimerRef.current);
    if (mainScrollFrameRef.current) cancelAnimationFrame(mainScrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (activePhoto?.type !== 'video') {
      setVideoFrame(null);
      return;
    }
    const stage = videoStageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(measureVideoFrame);
    observer.observe(stage);
    measureVideoFrame();
    return () => observer.disconnect();
  }, [activePhoto?.id, activePhoto?.type, measureVideoFrame]);

  const selectPhoto = useCallback((photoId: string, driver: 'main' | 'strip' | 'external') => {
    driverRef.current = driver;
    onSelectPhoto?.(photoId);
    scheduleDriverRelease(driver);
  }, [onSelectPhoto, scheduleDriverRelease]);

  const handleMainScroll = () => {
    if (driverRef.current === 'strip' || driverRef.current === 'external') return;
    driverRef.current = 'main';
    if (mainScrollFrameRef.current) cancelAnimationFrame(mainScrollFrameRef.current);
    mainScrollFrameRef.current = requestAnimationFrame(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;
      const id = nearestItemId(carousel, '[data-photo-id]', carousel.getBoundingClientRect().left + carousel.clientWidth / 2);
      if (id && id !== activePhoto?.id) onSelectPhoto?.(id);
      updateThumbnailDistances();
      scheduleDriverRelease('main');
    });
  };

  const handleThumbnailScroll = () => {
    if (driverRef.current === 'main' || driverRef.current === 'external') return;
    driverRef.current = 'strip';
    updateThumbnailDistances();
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const id = nearestItemId(
      strip,
      '[data-thumbnail-id]',
      strip.getBoundingClientRect().left + strip.clientWidth / 2,
    );
    if (id && id !== activePhoto?.id) onSelectPhoto?.(id);
    scheduleDriverRelease('strip');
  };

  const handleThumbnailWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const strip = thumbnailStripRef.current;
    if (!strip || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY;
  };

  const selectThumbnail = (photoId: string) => {
    selectPhoto(photoId, 'strip');
    centerItem(thumbnailStripRef.current, '[data-thumbnail-id]', photoId, 'smooth');
  };

  const downloadPhoto = async (photo: LightboxPhoto) => {
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (photos.length < 2 || activeIndex < 0) return;
      if (event.key === 'ArrowLeft') {
        selectPhoto(photos[Math.max(0, activeIndex - 1)].id, 'external');
      }
      if (event.key === 'ArrowRight') {
        selectPhoto(photos[Math.min(photos.length - 1, activeIndex + 1)].id, 'external');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, onClose, photos, selectPhoto]);

  useEffect(() => {
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    pinchStartDistanceRef.current = null;
    pinchStartMidpointRef.current = null;
    panStartRef.current = null;
    setIsZoomGestureActive(false);
    setIsVideoPlaying(false);
    setIsVideoMuted(false);
    setVideoTime(0);
    setVideoDuration(0);
    setVideoPlaybackError('');
    setPlaybackIndicator(null);
    if (playbackIndicatorTimerRef.current !== null) {
      window.clearTimeout(playbackIndicatorTimerRef.current);
      playbackIndicatorTimerRef.current = null;
    }
    setControlsVisible(true);
    const video = activePhoto?.type === 'video' ? videoRef.current : null;
    video?.pause();
    if (video) video.currentTime = 0;
  }, [activePhoto?.id]);

  useEffect(() => {
    if (activePhoto?.type !== 'video') return;
    setControlsVisible(true);
    controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2500);
    return () => {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    };
  }, [activePhoto?.id, activePhoto?.type]);

  const clampZoomOffset = (offset: { x: number; y: number }, scale: number, photoId: string) => {
    const frame = imageFrames[photoId];
    if (!frame) return offset;
    return {
      x: Math.min(frame.width * (scale - 1) / 2, Math.max(-frame.width * (scale - 1) / 2, offset.x)),
      y: Math.min(frame.height * (scale - 1) / 2, Math.max(-frame.height * (scale - 1) / 2, offset.y)),
    };
  };

  const handlePinchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.photoId !== activePhoto?.id) return;
    setIsZoomGestureActive(true);
    if (event.touches.length === 1 && zoomScale > 1) {
      const touch = event.touches[0];
      panStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        offsetX: zoomOffset.x,
        offsetY: zoomOffset.y,
      };
      return;
    }
    if (event.touches.length !== 2) return;
    const [first, second] = Array.from(event.touches);
    pinchStartDistanceRef.current = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    pinchStartScaleRef.current = zoomScale;
    pinchStartOffsetRef.current = zoomOffset;
    pinchStartMidpointRef.current = {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
    panStartRef.current = null;
  };

  const handlePinchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.currentTarget.dataset.photoId !== activePhoto?.id) return;
    if (event.touches.length === 2 && pinchStartDistanceRef.current !== null) {
      event.preventDefault();
      const [first, second] = Array.from(event.touches);
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const nextScale = Math.min(4, Math.max(1, pinchStartScaleRef.current * distance / pinchStartDistanceRef.current));
      const rect = event.currentTarget.getBoundingClientRect();
      const midpoint = {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
      };
      const start = pinchStartMidpointRef.current || midpoint;
      const offset = {
        x: midpoint.x - rect.left - rect.width / 2
          - (start.x - rect.left - rect.width / 2 - pinchStartOffsetRef.current.x) * nextScale / pinchStartScaleRef.current,
        y: midpoint.y - rect.top - rect.height / 2
          - (start.y - rect.top - rect.height / 2 - pinchStartOffsetRef.current.y) * nextScale / pinchStartScaleRef.current,
      };
      setZoomScale(nextScale);
      setZoomOffset(clampZoomOffset(offset, nextScale, activePhoto.id));
      return;
    }
    if (event.touches.length === 1 && zoomScale > 1 && panStartRef.current) {
      event.preventDefault();
      const touch = event.touches[0];
      setZoomOffset(clampZoomOffset({
        x: panStartRef.current.offsetX + touch.clientX - panStartRef.current.x,
        y: panStartRef.current.offsetY + touch.clientY - panStartRef.current.y,
      }, zoomScale, activePhoto.id));
    }
  };

  const handlePinchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchStartDistanceRef.current = null;
      pinchStartMidpointRef.current = null;
    }
    if (event.touches.length === 0) {
      panStartRef.current = null;
      if (zoomScale <= 1) setZoomOffset({ x: 0, y: 0 });
      setIsZoomGestureActive(false);
    }
  };

  const zoomAtPoint = (scale: number, clientX: number, clientY: number, slide: HTMLDivElement) => {
    if (!activePhoto) return;
    const nextScale = Math.min(4, Math.max(1, scale));
    const rect = slide.getBoundingClientRect();
    const point = { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
    const offset = nextScale === 1
      ? { x: 0, y: 0 }
      : {
        x: point.x - (point.x - zoomOffset.x) * nextScale / zoomScale,
        y: point.y - (point.y - zoomOffset.y) * nextScale / zoomScale,
      };
    setZoomScale(nextScale);
    setZoomOffset(clampZoomOffset(offset, nextScale, activePhoto.id));
  };

  const showPlaybackIndicator = () => {
    setPlaybackIndicator('play');
    if (playbackIndicatorTimerRef.current !== null) window.clearTimeout(playbackIndicatorTimerRef.current);
    playbackIndicatorTimerRef.current = window.setTimeout(() => {
      setPlaybackIndicator(null);
      playbackIndicatorTimerRef.current = null;
    }, 720);
  };

  const toggleVideoPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      showPlaybackIndicator();
      setVideoPlaybackError('');
      void video.play().catch((error: unknown) => {
        console.error('Could not play the fullscreen video:', error);
        setVideoPlaybackError('Could not play this video.');
      });
    } else {
      showPlaybackIndicator();
      video.pause();
    }
  };

  const revealControls = () => {
    setControlsVisible(true);
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    if (!isScrubbingRef.current) {
      controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2500);
    }
  };

  const formatMediaTime = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor(safeSeconds / 60) % 60;
    const remainingSeconds = Math.floor(safeSeconds % 60);
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  if (!activePhoto) return null;

  const activeVideo = activePhoto.type === 'video';

  return (
    <motion.div
      data-no-edge-swipe
      data-no-view-swipe
      className="fixed inset-0 z-[11000] overflow-hidden bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div
        ref={carouselRef}
        onScroll={handleMainScroll}
        onPointerMove={activeVideo ? revealControls : undefined}
        className="photo-main-carousel absolute inset-0 z-[2] flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
        style={{
          scrollbarWidth: 'none',
          touchAction: 'pan-x pan-y',
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        }}
      >
        {photos.map((photo) => {
          const frame = imageFrames[photo.id];
          const isActive = photo.id === activePhoto.id;
          return (
            <div
              key={photo.id}
              data-photo-id={photo.id}
              onTouchStart={photo.type === 'video' ? undefined : handlePinchStart}
              onTouchMove={photo.type === 'video' ? undefined : handlePinchMove}
              onTouchEnd={photo.type === 'video' ? undefined : handlePinchEnd}
              onTouchCancel={photo.type === 'video' ? undefined : handlePinchEnd}
              onClick={isActive && photo.type === 'video' ? () => {
                toggleVideoPlayback();
                revealControls();
              } : undefined}
              onDoubleClick={(event) => {
                if (!isActive || photo.type === 'video') return;
                zoomAtPoint(zoomScale > 1 ? 1 : 2, event.clientX, event.clientY, event.currentTarget);
              }}
              onWheel={(event) => {
                if (!isActive || photo.type === 'video' || (!event.ctrlKey && zoomScale <= 1)) return;
                event.preventDefault();
                zoomAtPoint(zoomScale * (event.deltaY < 0 ? 1.12 : 0.89), event.clientX, event.clientY, event.currentTarget);
              }}
              className="relative flex h-full w-full flex-[0_0_100%] snap-center snap-always items-center justify-center overflow-visible"
              style={{ touchAction: isActive && photo.type !== 'video' && zoomScale > 1 ? 'none' : 'pan-x pan-y' }}
            >
              {photo.type === 'video' ? (
                <div
                  ref={isActive ? videoStageRef : undefined}
                  className="relative flex h-full w-full items-center justify-center"
                >
                  <div
                    className="relative shrink-0"
                    style={isActive && videoFrame?.photoId === photo.id
                      ? { width: videoFrame.width, height: videoFrame.height }
                      : { width: '100%', height: '100%' }}
                  >
                    <video
                      ref={isActive ? videoRef : undefined}
                      src={photo.url}
                      playsInline
                      preload={isActive ? 'metadata' : 'none'}
                      muted={isVideoMuted}
                      onLoadedMetadata={(event) => {
                        if (isActive) {
                          setVideoDuration(event.currentTarget.duration || 0);
                          measureVideoFrame();
                        }
                      }}
                      onTimeUpdate={(event) => {
                        if (isActive) setVideoTime(event.currentTarget.currentTime);
                      }}
                      onPlay={() => {
                        if (isActive) {
                          setIsVideoPlaying(true);
                          revealControls();
                        }
                      }}
                      onPause={() => {
                        if (isActive) {
                          setIsVideoPlaying(false);
                          revealControls();
                        }
                      }}
                      onEnded={() => {
                        if (isActive) {
                          setIsVideoPlaying(false);
                          showPlaybackIndicator();
                        }
                      }}
                      onError={() => {
                        if (isActive) setVideoPlaybackError('Could not play this video.');
                      }}
                      aria-label={t('Video player')}
                      className="absolute inset-0 z-[2] block h-full w-full select-none object-contain"
                    />
                    {isActive && videoFrame?.photoId === photo.id && (
                      <>
                        <AnimatePresence>
                          {(!isVideoPlaying || playbackIndicator !== null) && (
                            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                              <LiquidGlass
                                as={motion.button}
                                key="play"
                                type="button"
                                aria-label={t(isVideoPlaying ? 'Pause video' : 'Play video')}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleVideoPlayback();
                                  revealControls();
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                                initial={{ opacity: 0, scale: 0.72 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.82 }}
                                transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                                radius={999}
                                className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                              >
                                <Play size={27} weight="fill" />
                              </LiquidGlass>
                            </div>
                          )}
                        </AnimatePresence>
                        <motion.div
                          animate={{ opacity: controlsVisible ? 1 : 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          style={{ pointerEvents: 'none' }}
                          className="pointer-events-none absolute inset-0 z-20 text-white"
                        >
                          {showCloseButton && (
                            <button
                              type="button"
                              aria-label={t('Close video')}
                              onClick={(event) => {
                                event.stopPropagation();
                                onClose();
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                              className={`${controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'} absolute right-4 top-4 flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]`}
                            >
                              <X size={24} weight="bold" />
                            </button>
                          )}
                          <div
                            className="pointer-events-none absolute inset-x-5 bottom-4 mx-auto flex max-w-xl items-center gap-3 text-white"
                            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.5))' }}
                          >
                            <button
                              type="button"
                              aria-label={t(isVideoPlaying ? 'Pause video' : 'Play video')}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleVideoPlayback();
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                              className={`${controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'} flex h-10 w-10 shrink-0 items-center justify-center text-white transition-transform active:scale-95`}
                            >
                              {isVideoPlaying ? <Pause size={23} weight="fill" /> : <Play size={23} weight="fill" />}
                            </button>
                            <span className="w-10 shrink-0 text-right text-xs tabular-nums" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
                              {formatMediaTime(videoTime)}
                            </span>
                            <input
                              type="range"
                              aria-label={t('Seek video')}
                              min={0}
                              max={videoDuration || 0}
                              step={0.1}
                              value={Math.min(videoTime, videoDuration || 0)}
                              style={{
                                '--video-progress': `${videoDuration > 0
                                  ? Math.min(100, (videoTime / videoDuration) * 100)
                                  : 0}%`,
                              } as React.CSSProperties}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                isScrubbingRef.current = true;
                                setIsScrubbing(true);
                                if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
                                setControlsVisible(true);
                              }}
                              onPointerUp={() => {
                                isScrubbingRef.current = false;
                                setIsScrubbing(false);
                                revealControls();
                              }}
                              onPointerCancel={() => {
                                isScrubbingRef.current = false;
                                setIsScrubbing(false);
                                revealControls();
                              }}
                              onBlur={() => {
                                isScrubbingRef.current = false;
                                setIsScrubbing(false);
                                revealControls();
                              }}
                              onChange={(event) => {
                                const nextTime = Number(event.currentTarget.value);
                                setVideoTime(nextTime);
                                if (videoRef.current) videoRef.current.currentTime = nextTime;
                              }}
                              onClick={(event) => event.stopPropagation()}
                              className={`${controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'} video-scrubber min-w-0 flex-1 ${isScrubbing ? 'is-dragging' : ''}`}
                            />
                            <span className="w-10 shrink-0 text-xs tabular-nums" style={{ textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>
                              {formatMediaTime(videoDuration)}
                            </span>
                            <button
                              type="button"
                              aria-label={t(isVideoMuted ? 'Unmute video' : 'Mute video')}
                              onClick={(event) => {
                                event.stopPropagation();
                                setIsVideoMuted((muted) => !muted);
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                              className={`${controlsVisible ? 'pointer-events-auto' : 'pointer-events-none'} flex h-10 w-10 shrink-0 items-center justify-center text-white transition-transform active:scale-95`}
                            >
                              {isVideoMuted ? <SpeakerSlash size={21} /> : <SpeakerHigh size={21} />}
                            </button>
                          </div>
                          {videoPlaybackError && (
                            <p role="alert" className="absolute inset-x-4 bottom-16 text-center text-xs text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
                              {t(videoPlaybackError)}
                            </p>
                          )}
                        </motion.div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <img
                  data-photo-image={photo.id}
                  src={photo.url}
                  alt={t('Shared trip photo')}
                  loading={isActive ? 'eager' : 'lazy'}
                  onLoad={(event) => measureImage(photo.id, event.currentTarget)}
                  className="relative z-[2] block h-full w-full select-none object-contain"
                  style={{
                    transform: isActive && zoomScale > 1
                      ? `translate3d(${zoomOffset.x}px, ${zoomOffset.y}px, 0) scale(${zoomScale})`
                      : undefined,
                    transformOrigin: 'center center',
                    transition: isZoomGestureActive ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    willChange: isActive && zoomScale > 1 ? 'transform' : undefined,
                  }}
                  draggable={false}
                />
              )}
              {isActive && frame && photo.type !== 'video' && (
                <button
                  type="button"
                  aria-label={t('Download photo')}
                  onClick={(event) => {
                    event.stopPropagation();
                    void downloadPhoto(photo);
                  }}
                  disabled={downloading}
                  className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-20 flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-transform active:scale-95 disabled:opacity-60"
                >
                  <DownloadSimple size={21} weight="bold" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showCloseButton && !activeVideo && (
        <button
          type="button"
          aria-label={t('Close photo')}
          onClick={onClose}
          className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-30 flex h-11 w-11 items-center justify-center text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
        >
          <X size={24} weight="bold" />
        </button>
      )}

      <div
        ref={thumbnailStripRef}
        onScroll={handleThumbnailScroll}
        onWheel={handleThumbnailWheel}
        className="photo-thumbnail-strip absolute inset-x-0 bottom-0 z-40 flex h-[72px] snap-x snap-mandatory items-center gap-2 overflow-x-auto overflow-y-hidden"
        style={{
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
          paddingInline: 'calc(50vw - 24px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          touchAction: 'pan-x',
        }}
      >
        {photos.map((photo) => (
          <PhotoThumbnail
            key={photo.id}
            photo={photo}
            onClick={() => selectThumbnail(photo.id)}
            registerMotionValue={registerMotionValue}
          />
        ))}
      </div>
    </motion.div>
  );
};
