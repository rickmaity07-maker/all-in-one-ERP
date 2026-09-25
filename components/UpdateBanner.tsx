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
    const first = setTimeout(() => checkForUpdate(), 3000);
    // On Android the native start-up check may still be running at 3 s; look again a bit later.
    const second = isAndroidApp() ? setTimeout(() => checkForUpdate(), 20_000) : undefined;
    const timer = setInterval(() => checkForUpdate(), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
      clearInterval(timer);
    };
  }, []);

  const shown =
    (status.state === "available" && dismissed !== status.version) ||
    status.state === "apk-opened" || status.state === "downloading" || status.state === "installing";
  useEffect(() => {
    document.documentElement.toggleAttribute("data-update-notice", shown);
    return () => document.documentElement.removeAttribute("data-update-notice");
  }, [shown]);

  if (status.state === "available" && dismissed !== status.version) {
    return (
      <div role="status" className="fixed z-40 left-4 right-4 bottom-4 md:left-24 md:right-auto md:max-w-sm rounded-2xl shadow-2xl bg-emerald-600 text-white text-sm font-semibold flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
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
      <div role="status" className="fixed z-40 left-4 right-4 bottom-4 md:left-24 md:right-auto md:max-w-sm rounded-2xl shadow-2xl bg-emerald-700 text-white text-sm font-semibold flex items-center gap-3 px-4 py-3">
        <Download size={16} className="shrink-0" /> Version {status.version} is downloading in your browser — open the downloaded file to install it.
      </div>
    );
  }

  if (status.state === "downloading" || status.state === "installing") {
    return (
      <div role="status" className="fixed z-40 left-4 right-4 bottom-4 md:left-24 md:right-auto md:max-w-sm rounded-2xl shadow-2xl bg-emerald-700 text-white text-sm font-semibold flex items-center gap-3 px-4 py-3">
        <Loader2 size={16} className="animate-spin" />
        {status.state === "downloading" ? `Downloading update… ${status.percent}%` : "Installing update — the app will restart automatically."}
      </div>
    );
  }

  return null;
}
