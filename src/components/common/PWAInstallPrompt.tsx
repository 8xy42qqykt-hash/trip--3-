import React, { useEffect, useState } from 'react';
import { DownloadSimple, X } from '@phosphor-icons/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isMobile = /mobile|touch/.test(userAgent);
    setIsMobileDevice(isMobile);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isMobileDevice,
    install,
  };
}

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isMobileDevice, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="min-h-[48px] px-5 flex items-center gap-2 rounded-full text-sm font-semibold text-[#0A84FF] bg-white/10 active-press cursor-pointer border border-white/10 hover:bg-white/15"
      >
        <DownloadSimple size={18} weight="bold" />
        <span>Install App</span>
      </button>
    );
  }

  if (isMobileDevice) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="min-h-[48px] px-5 flex items-center gap-2 rounded-full text-sm font-semibold text-[#0A84FF] bg-white/10 active-press cursor-pointer border border-white/10 hover:bg-white/15"
        >
          <DownloadSimple size={18} weight="bold" />
          <span>Install App</span>
        </button>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div onClick={() => setShowModal(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              style={{
                backdropFilter: 'blur(30px) saturate(180%)',
                WebkitBackdropFilter: 'blur(30px) saturate(180%)',
              }}
              className="relative z-10 w-full max-w-xs bg-[#1e1e22] border border-white/10 rounded-[28px] p-6 shadow-2xl animate-calm-fade-in"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-bold text-white">Install on Mobile</span>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 active-press cursor-pointer"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>
              <div className="text-sm text-slate-300 space-y-2 mb-5">
                <p>1. Tap the Share button in your browser toolbar.</p>
                <p>2. Select &quot;Add to Home Screen&quot;.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full min-h-[48px] rounded-[20px] bg-[#0A84FF] text-white font-semibold text-sm active-press cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
