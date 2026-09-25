"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { checkForUpdate, useUpdater } from "@/lib/updater";
import { isAndroidApp } from "@/lib/utils";

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

// Checks GitHub Releases for a newer signed build on start-up and every few hours,
// then offers a one-click download + install + restart.
export default function UpdateBanner() {
  const { status, install } = useUpdater();
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const first = setTimeout(checkForUpdate, 3000);
    const timer = setInterval(checkForUpdate, CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (status.state === "available" && dismissed !== status.version) {
    return (
      <div className="bg-emerald-500 text-white text-sm font-semibold flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2 shrink-0 text-center">
        <RefreshCw size={16} />
        <span>Version {status.version} is available with new features and fixes.</span>
        <button onClick={install} className="flex items-center gap-1.5 bg-white text-emerald-700 px-3 py-1 rounded-lg font-bold hover:bg-emerald-50">
          <Download size={14} /> {isAndroidApp() ? "Download update" : <>Update &amp; restart</>}
        </button>
        <button onClick={() => setDismissed(status.version)} className="text-white/80 hover:text-white" title="Remind me later">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (status.state === "apk-opened") {
    return (
      <div className="bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-3 px-4 py-2 shrink-0 text-center">
        <Download size={16} className="shrink-0" /> Version {status.version} is downloading in your browser — open the downloaded file to install it.
      </div>
    );
  }

  if (status.state === "downloading" || status.state === "installing") {
    return (
      <div className="bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-3 px-4 py-2 shrink-0">
        <Loader2 size={16} className="animate-spin" />
        {status.state === "downloading" ? `Downloading update… ${status.percent}%` : "Installing update — the app will restart automatically."}
      </div>
    );
  }

  return null;
}
