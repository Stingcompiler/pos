import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function PWAInstallBadge() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user has already clicked the prompt in the past
    const hasInteracted = localStorage.getItem('pwa_prompt_clicked');
    if (hasInteracted === 'true') {
      return;
    }

    // Capture the PWA install event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Hide the icon immediately from UI
    setIsVisible(false);

    // Save to localStorage so it never renders again for this user
    localStorage.setItem('pwa_prompt_clicked', 'true');

    // Show the native install prompt immediately
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    // Clear the deferred prompt variable
    setDeferredPrompt(null);
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <button
      onClick={handleInstallClick}
      className="fixed bottom-6 left-6 z-50 bg-dal-red text-white p-4 rounded-full shadow-2xl animate-bounce hover:bg-red-700 transition-all flex items-center justify-center gap-2 cursor-pointer border-0 font-cairo text-sm font-bold no-print"
      title="تثبيت التطبيق"
      dir="rtl"
    >
      <Download className="w-5 h-5 text-white" />
      <span className="font-cairo">تثبيت التطبيق</span>
    </button>
  );
}
