"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CloudUpload, AlertTriangle, Trash2 } from "lucide-react";
import { discard, flush, myQueuedOps, onQueueChange, startOfflineSync, type QueuedOp } from "@/lib/offline";
import { Modal, toast } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// Connection state and offline changes: "you're offline", "3 changes waiting", "syncing…",
// and any change the server refused after reconnecting (with the reason, and a way to discard it).
export default function ConnectionBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState({ pending: 0, failed: 0, syncing: false });
  const [review, setReview] = useState<QueuedOp[] | null>(null);

  useEffect(() => {
    startOfflineSync();
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const off = onQueueChange(setQueue);
    const onSynced = (e: Event) => {
      const { synced, failed } = (e as CustomEvent<{ synced: number; failed: number }>).detail;
      if (synced) toast(t("{n} offline change(s) synced.", { n: synced }));
      if (failed) toast(t("{n} offline change(s) could not be saved. Tap Review.", { n: failed }), "error");
    };
    window.addEventListener("erp:synced", onSynced);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("erp:synced", onSynced);
      off();
    };
  }, [t]);

  const openReview = async () => setReview((await myQueuedOps()).filter((o) => o.error));

  const reviewModal = review && (
    <Modal title={t("Changes that could not be saved")} icon={AlertTriangle} onClose={() => setReview(null)}>
      {review.length === 0 ? (
        <p className="text-sm text-slate-500">{t("Nothing left to review.")}</p>
      ) : (
        <ul className="space-y-3">
          {review.map((o) => (
            <li key={o.key} className="p-3 rounded-xl border border-red-100 bg-red-50/50">
              <p className="font-bold text-slate-800 text-sm">{o.label}</p>
              <p className="text-xs text-slate-500">{fmtDateTime(o.createdAt)}</p>
              <p className="text-xs text-red-700 mt-1">{o.error}</p>
              <button
                onClick={async () => {
                  await discard(o.key);
                  setReview((r) => r?.filter((x) => x.key !== o.key) ?? null);
                }}
                className="mt-2 text-xs font-bold text-red-700 flex items-center gap-1"
              >
                <Trash2 size={12} /> {t("Discard")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );

  if (offline) {
    return (
      <div role="status" className="bg-slate-800 text-white text-sm font-semibold flex flex-wrap items-center justify-center gap-2 px-4 py-2 shrink-0 text-center">
        <WifiOff size={16} className="shrink-0" /> {t("You're offline — changes are saved on this device and sync when you're back online.")}
        {queue.pending > 0 && <span className="bg-white/15 rounded-lg px-2 py-0.5">{t("{n} waiting", { n: queue.pending })}</span>}
      </div>
    );
  }
  if (queue.syncing || queue.pending > 0) {
    return (
      <div role="status" className="bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4 py-2 shrink-0 text-center">
        {queue.syncing ? <RefreshCw size={16} className="animate-spin shrink-0" /> : <CloudUpload size={16} className="shrink-0" />}
        {queue.syncing ? t("Syncing {n} offline change(s)…", { n: queue.pending }) : t("{n} offline change(s) waiting to sync.", { n: queue.pending })}
        {!queue.syncing && <button onClick={() => void flush()} className="underline">{t("Sync now")}</button>}
      </div>
    );
  }
  if (queue.failed > 0) {
    return (
      <>
        <div role="status" className="bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 px-4 py-2 shrink-0 text-center">
          <AlertTriangle size={16} className="shrink-0" /> {t("{n} offline change(s) could not be saved.", { n: queue.failed })}
          <button onClick={openReview} className="underline">{t("Review")}</button>
        </div>
        {reviewModal}
      </>
    );
  }
  return reviewModal || null;
}
