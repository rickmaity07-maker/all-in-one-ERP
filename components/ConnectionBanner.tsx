"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Tells people when the device has lost its connection (common on phones), so failed saves make sense.
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4 py-2 shrink-0 text-center">
      <WifiOff size={16} className="shrink-0" /> You&apos;re offline — changes can&apos;t be saved until the connection is back.
    </div>
  );
}
