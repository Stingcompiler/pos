import { useState, useEffect } from 'react';
import { Smartphone, Download, X } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the default browser mini-infobar prompt
      e.preventDefault();
      // Store the event so it can be triggered later
      setDeferredPrompt(e);
      // Immediately reveal the custom premium prompt
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If PWA is already installed or active, listen to appinstalled to dismiss
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsVisible(false);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the browser prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    // We no longer need the prompt, clear it
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleCloseClick = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 animate-slide-up no-print font-cairo" dir="rtl">
      {/* Backdrop blur overlay */}
      <div className="fixed inset-0 -z-10 bg-surface-950/20 backdrop-blur-md" onClick={handleCloseClick} />
      
      {/* Mobile-first Bottom Sheet Card */}
      <div className="max-w-md mx-auto bg-surface-900/95 border border-white/10 rounded-2xl shadow-2xl p-5 relative overflow-hidden">
        
        {/* Glow accent */}
        <div className="absolute -top-10 -left-10 w-24 h-24 rounded-full bg-primary-500/20 blur-2xl" />
        
        <div className="flex items-start gap-4">
          {/* Smart Phone Icon Box */}
          <div className="w-12 h-12 rounded-2xl bg-primary-600/10 border border-primary-500/20 flex items-center justify-center text-primary-400 flex-shrink-0 animate-bounce">
            <Smartphone className="w-6 h-6" />
          </div>

          {/* Prompt Details */}
          <div className="flex-1 space-y-2 text-right">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white leading-normal">تطبيق متجر دال للسيارات</h3>
              <button 
                onClick={handleCloseClick}
                className="text-surface-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-xs text-surface-300 leading-relaxed font-semibold">
              تثبيت تطبيق متجر دال للسيارات للوصول السريع للمنتجات، والطلبات، والرسائل مباشرة من شاشتك الرئيسية!
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 py-2.5 px-4 rounded-xl bg-dal-red hover:bg-red-700 text-white text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-dal-red/10 border-0"
              >
                <Download className="w-4 h-4" />
                تثبيت التطبيق
              </button>
              
              <button
                onClick={handleCloseClick}
                className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-surface-300 hover:text-white text-xs font-bold transition-all cursor-pointer border border-white/5"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
