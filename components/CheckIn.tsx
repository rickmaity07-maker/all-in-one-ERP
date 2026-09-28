"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Nfc, X, Loader2, CheckCircle2, XCircle, ScanLine, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Modal, Card, toast } from "@/components/ui";
import { androidBridge, errorMessage, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Live = { open: boolean; code?: string; qr?: string; refresh_in?: number; expires_at?: string; checked_in?: number };

// Teacher: shows a code that changes every 20 seconds (and its QR) for students to check themselves in.
export function CheckInCode({ cls, onClose }: { cls: Row; onClose: () => void }) {
  const t = useT();
  const [session, setSession] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [qr, setQr] = useState("");
  const [lateAfter, setLateAfter] = useState(5);

  useEffect(() => {
    if (!session) return;
    let off = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const { data, error } = await supabase.rpc("current_checkin_code", { p_session: session });
      if (off) return;
      if (error) {
        toast(errorMessage(error), "error");
        return;
      }
      const l = data as Live;
      setLive(l);
      if (l.qr) setQr(await QRCode.toDataURL(l.qr, { width: 320, margin: 1 }));
      if (l.open) timer = setTimeout(tick, Math.min((l.refresh_in ?? 5) * 1000, 4000));
    };
    void tick();
    return () => {
      off = true;
      clearTimeout(timer);
    };
  }, [session]);

  const open = async () => {
    const { data, error } = await supabase.rpc("open_checkin", { p_class: cls.id, p_minutes: 15, p_late_after: lateAfter });
    if (error) return toast(errorMessage(error), "error");
    setSession(data as string);
  };
  const close = async () => {
    if (session && live?.open) await supabase.rpc("close_checkin", { p_session: session });
    onClose();
  };

  return (
    <Modal title={`Check-in — ${cls.name}`} icon={QrCode} onClose={close} wide>
      {!session ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t("Students scan the QR code or type the code in their app (Attendance → Check in). The code changes every 20 seconds, so it can't be shared outside the room.")}</p>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {t("Mark as late after")}
            <input type="number" min={0} max={60} value={lateAfter} onChange={(e) => setLateAfter(Number(e.target.value) || 0)} className="w-16 px-2 py-1 border border-slate-200 rounded-lg" />
            {t("minutes (0 = never)")}
          </label>
          <button onClick={open} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2"><QrCode size={18} /> {t("Start check-in (15 minutes)")}</button>
        </div>
      ) : !live ? (
        <p className="py-10 text-center text-slate-500"><Loader2 className="inline animate-spin" /></p>
      ) : !live.open ? (
        <div className="text-center py-6 space-y-3">
          <p className="font-bold text-slate-800">{t("Check-in has closed.")}</p>
          <button onClick={onClose} className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold">{t("Done")}</button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URL */}
          {qr && <img src={qr} alt={t("Check-in QR code")} className="w-64 h-64 rounded-2xl border" />}
          <div className="text-center md:text-left space-y-3">
            <p className="text-xs font-bold uppercase text-slate-400">{t("Code")}</p>
            <p className="text-6xl font-black tracking-[0.2em] text-slate-900 font-mono" data-testid="checkin-code">{live.code}</p>
            <p className="text-sm text-slate-500">{t("Changes in {s} s", { s: live.refresh_in ?? 0 })}</p>
            <p className="text-lg font-bold text-emerald-700" aria-live="polite">{t("{n} checked in", { n: live.checked_in ?? 0 })}</p>
            <button onClick={close} className="px-5 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-700 flex items-center gap-2"><X size={16} /> {t("Stop check-in")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Teacher: take the register by tapping student ID cards — on an Android phone's NFC reader, or with a
// USB card reader on a computer (these type the card number followed by Enter).
export function CardTap({ cls, date, onMarked, onClose }: { cls: Row; date: string; onMarked: () => void; onClose: () => void }) {
  const t = useT();
  const [results, setResults] = useState<{ id: number; ok: boolean; text: string }[]>([]);
  const [typed, setTyped] = useState("");
  const [nfc] = useState(() => {
    const bridge = androidBridge();
    return bridge?.nfcStatus ? bridge.nfcStatus() : "none";
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const recent = useRef(new Map<string, number>());

  useEffect(() => {
    const mark = async (uid: string) => {
      // The same card held to the reader fires many times: ignore repeats for a few seconds.
      const now = Date.now();
      if ((recent.current.get(uid) ?? 0) > now - 4000) return;
      recent.current.set(uid, now);
      const { data, error } = await supabase.rpc("mark_attendance_by_card", { p_class: cls.id, p_date: date, p_card: uid });
      const entry = error
        ? { id: now, ok: false, text: `${uid}: ${errorMessage(error)}` }
        : { id: now, ok: true, text: `${(data as Row).name} — ${t((data as Row).status)}` };
      setResults((r) => [entry, ...r].slice(0, 30));
      if (!error) onMarked();
      if (typeof navigator.vibrate === "function") navigator.vibrate(error ? [80, 60, 80] : 60);
    };
    const onNfc = (e: Event) => void mark((e as CustomEvent<string>).detail);
    window.addEventListener("erp:nfc", onNfc);
    (window as unknown as { __erpCardTap?: (uid: string) => Promise<void> }).__erpCardTap = mark;
    androidBridge()?.startNfc?.();
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("erp:nfc", onNfc);
      androidBridge()?.stopNfc?.();
    };
  }, [cls.id, date, onMarked, t]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const uid = typed.trim();
    setTyped("");
    if (uid) void (window as unknown as { __erpCardTap: (uid: string) => Promise<void> }).__erpCardTap(uid);
  };

  return (
    <Modal title={`Tap cards — ${cls.name}`} icon={Nfc} onClose={onClose}>
      <div className="space-y-4">
        {nfc === "ready" && <p className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Nfc size={16} /> {t("Hold each student's card to the back of this phone.")}</p>}
        {nfc === "off" && <p className="p-3 rounded-xl bg-orange-50 text-orange-800 text-sm font-semibold">{t("NFC is switched off. Turn it on in the phone's settings, or use a card reader.")}</p>}
        <form onSubmit={submitTyped}>
          <label className="block text-xs font-bold uppercase text-slate-500 mb-2">{t("Card number (card reader or keyboard)")}</label>
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label={t("Card number")}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-mono" placeholder="04A1B2C3" />
        </form>
        <ul className="space-y-1 max-h-72 overflow-y-auto" aria-live="polite">
          {results.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 text-sm ${r.ok ? "text-emerald-700" : "text-red-700"}`}>
              {r.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {r.text}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

// Student: check in with the code on the board, or by scanning its QR code with the camera.
export function StudentCheckIn({ onCheckedIn }: { onCheckedIn: () => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

  const submit = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("checkin", { p_code: value.trim() });
    setBusy(false);
    const res = data as { ok: boolean; status?: string; class?: string; error?: string } | null;
    if (error || !res?.ok) {
      setResult({ ok: false, text: error ? errorMessage(error) : t(res?.error ?? "That code is not valid.") });
      return;
    }
    setCode("");
    setResult({ ok: true, text: t("Checked in to {cls} ({status}).", { cls: res.class ?? "", status: t(res.status ?? "Present") }) });
    onCheckedIn();
  };

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        while (!stop) {
          const found = await detector.detect(video).catch(() => []);
          const hit = found.find((f) => f.rawValue.startsWith("ERP-CHECKIN:"));
          if (hit) {
            setScanning(false);
            await submit(hit.rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        toast(t("The camera could not be opened. Type the code instead."), "error");
        setScanning(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card title="Check in to class">
      <form onSubmit={(e) => { e.preventDefault(); void submit(code); }} className="flex flex-wrap gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" aria-label={t("Check-in code")}
          className="flex-1 min-w-40 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-lg tracking-widest" />
        <button type="submit" disabled={busy || code.length !== 6} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} {t("Check in")}
        </button>
        {canScan && (
          <button type="button" onClick={() => setScanning((s) => !s)} className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-2">
            <ScanLine size={16} /> {scanning ? t("Stop camera") : t("Scan QR")}
          </button>
        )}
      </form>
      {scanning && <video ref={videoRef} muted playsInline className="mt-4 w-full max-w-sm rounded-2xl bg-black" />}
      {result && (
        <p role="status" className={`mt-4 text-sm font-bold flex items-center gap-2 ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {result.text}
        </p>
      )}
    </Card>
  );
}
