import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, ArrowsClockwise, VideoCamera } from '@phosphor-icons/react';
import { useLanguage } from '../../context/LanguageContext';
import { LiquidGlass } from '../ui/LiquidGlass';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (blob: Blob, mediaType: 'image' | 'video') => void;
  captureMode?: 'photo' | 'video';
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  captureMode = 'photo',
}) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileFallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    let cancelled = false;
    void startCamera(() => cancelled);
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, facingMode, captureMode]);

  const startCamera = async (isCancelled: () => boolean) => {
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
        audio: captureMode === 'video',
      });
      if (isCancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      if (!isCancelled()) {
        console.warn('Camera error or permission denied:', err);
        setHasCameraError(true);
      }
    }
  };

  const stopCamera = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    setIsRecording(false);
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
        onCapture(blob, 'image');
        onClose();
      }
    }, 'image/jpeg', 0.9);
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setHasCameraError(true);
      return;
    }

    const supportedTypes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/mp4' });
        mediaRecorderRef.current = null;
        recordedChunksRef.current = [];
        setIsRecording(false);
        if (blob.size > 0) {
          onCapture(blob, 'video');
          onClose();
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Could not start video recording:', error);
      setHasCameraError(true);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file, captureMode === 'video' ? 'video' : 'image');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <input
        type="file"
        ref={fileFallbackRef}
        accept={captureMode === 'video' ? 'video/*' : 'image/*'}
        capture="environment"
        onChange={handleFallbackFile}
        className="hidden"
      />
      <div className="relative w-full max-w-sm bg-black rounded-[32px] overflow-hidden shadow-2xl flex flex-col border border-white/20 animate-spring-in">
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <LiquidGlass
            as="button"
            type="button"
            radius={999}
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white cursor-pointer"
          >
            <X size={20} weight="bold" />
          </LiquidGlass>
          <LiquidGlass
            as="button"
            type="button"
            radius={999}
            onClick={flipCamera}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white cursor-pointer"
          >
            <ArrowsClockwise size={20} weight="bold" />
          </LiquidGlass>
        </div>

        <div className="relative w-full aspect-[3/4] bg-neutral-900 flex items-center justify-center overflow-hidden">
          {hasCameraError ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-white">
              <Camera size={44} className="text-slate-400" />
              <p className="text-sm text-slate-300">{t('Camera access required')}</p>
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="px-5 py-2.5 rounded-full bg-[#0A84FF] text-white text-sm font-semibold active-press cursor-pointer"
              >
                {captureMode === 'video' ? t('Choose Video') : t('Choose Photo')}
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
          {captureMode === 'video' ? (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={t(isRecording ? 'Stop recording' : 'Record video')}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white active:scale-95 transition-transform cursor-pointer"
            >
              {isRecording
                ? <span className="h-6 w-6 rounded-md bg-red-500" />
                : <VideoCamera size={28} weight="fill" className="text-white" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={capturePhoto}
              className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition-transform cursor-pointer"
            >
              <div className="w-full h-full bg-white rounded-full" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
