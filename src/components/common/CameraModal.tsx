import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, ArrowsClockwise } from '@phosphor-icons/react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (blob: Blob) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState(false);
  const fileFallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    setHasCameraError(false);
    try {
      if (streamRef.current) {
        stopCamera();
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCameraError(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera error or permission denied:', err);
      setHasCameraError(true);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
        onClose();
      }
    }, 'image/jpeg', 0.9);
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-calm-fade-in p-4">
      <input
        type="file"
        ref={fileFallbackRef}
        accept="image/*"
        capture="environment"
        onChange={handleFallbackFile}
        className="hidden"
      />
      <div className="relative w-full max-w-sm bg-black rounded-[32px] overflow-hidden shadow-2xl flex flex-col border border-white/20 animate-spring-in">
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-black/60 border border-white/20 backdrop-blur-md text-white flex items-center justify-center active-press cursor-pointer"
          >
            <X size={20} weight="bold" />
          </button>
          <button
            type="button"
            onClick={flipCamera}
            className="w-10 h-10 rounded-full bg-black/60 border border-white/20 backdrop-blur-md text-white flex items-center justify-center active-press cursor-pointer"
          >
            <ArrowsClockwise size={20} weight="bold" />
          </button>
        </div>

        <div className="relative w-full aspect-[3/4] bg-neutral-900 flex items-center justify-center overflow-hidden">
          {hasCameraError ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-white">
              <Camera size={44} className="text-slate-400" />
              <p className="text-sm text-slate-300">Camera access required</p>
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="px-5 py-2.5 rounded-full bg-[#0A84FF] text-white text-sm font-semibold active-press cursor-pointer"
              >
                Choose Photo
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
          )}
        </div>

        <div className="h-24 bg-black flex items-center justify-center">
          <button
            type="button"
            onClick={capturePhoto}
            className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition-transform cursor-pointer"
          >
            <div className="w-full h-full bg-white rounded-full" />
          </button>
        </div>
      </div>
    </div>
  );
};
