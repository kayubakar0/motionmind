import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))] z-50 flex items-center justify-center gap-2 border-y border-amber2/40 bg-amber2/10 px-4 py-2 text-sm text-amber2 backdrop-blur-md md:inset-x-auto md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:rounded-full md:border md:px-5 md:py-2.5 md:shadow-lg md:shadow-black/40">
      <WifiOff size={15} className="shrink-0" />
      <span>Anda sedang offline — menampilkan data tersimpan</span>
    </div>
  );
}
