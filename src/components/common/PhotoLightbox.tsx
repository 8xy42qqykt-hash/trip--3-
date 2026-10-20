import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from '@phosphor-icons/react';
import { useLanguage } from '../../context/LanguageContext';

let photoDownloadSequence = 0;

interface PhotoLightboxProps {
  imageUrl: string;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ imageUrl, onClose }) => {
  const { t } = useLanguage();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const downloadPhoto = async () => {
    setIsDownloading(true);
    setDownloadError('');
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Could not download photo (${response.status}).`);
      const blob = await response.blob();
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `trip-photo-${++photoDownloadSequence}.${extension}`;
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: t('Save photo') });
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Could not download photo:', error);
      setDownloadError(error instanceof Error ? error.message : t('Could not download this photo.'));
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-black/95 p-4"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
      onClick={onClose}
    >
      <div className="flex w-full max-w-3xl items-center justify-end gap-2 pb-3" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => void downloadPhoto()}
          disabled={isDownloading}
          style={{ backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}
          className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Download size={18} /> {t(isDownloading ? 'Saving…' : 'Save photo')}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close photo')}
          style={{ backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white"
        >
          <X size={20} />
        </button>
      </div>
      {downloadError && (
        <p role="alert" className="mb-3 max-w-3xl text-center text-sm text-red-200">
          {t(downloadError)}
        </p>
      )}
      <img
        src={imageUrl}
        alt={t('Shared trip photo')}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[82dvh] max-w-full object-contain"
      />
    </div>
  ), document.body);
};
