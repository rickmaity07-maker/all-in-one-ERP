"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DoorOpen, Plus, Copy, ScanLine, LogIn, LogOut, X, Search, IdCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Badge, Empty, Loading, AccessDenied, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDate, fmtDateTime, localDate, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "passes" | "desk";
type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
const STATUS_COLOR: Record<string, string> = { expected: "blue", arrived: "green", left: "slate", cancelled: "red" };

// Visitor passes (staff) and pickup passes (parents), checked at the gate by staff.
export default function Gate() {
  const { role, profile } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const parent = role === "parent";
  const [tab, setTab] = useState<TabId>(staff ? "desk" : "passes");
  const [passes, setPasses] = useState<Row[]>([]);
  const [children, setChildren] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ kind: staff ? "visit" : "pickup", person_name: "", person_phone: "", purpose: "", student_id: "", valid_on: localDate() });
  const [showing, setShowing] = useState<Row | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Row | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    const [p, links] = await Promise.all([
      supabase.from("gate_passes").select("*").gte("valid_on", localDate()).order("valid_on").order("created_at"),
      parent ? supabase.from("guardian_links").select("student_id").eq("guardian_id", profile?.id ?? "") : Promise.resolve({ data: [] as Row[] }),
    ]);
    const ids = (links.data ?? []).map((l) => l.student_id);
    const kids = ids.length ? (await supabase.from("profiles").select("id, full_name").in("id", ids)).data ?? [] : [];
    return { p: p.data ?? [], c: kids.map((k) => ({ student_id: k.id, profiles: { full_name: k.full_name } })) };
  }, [parent, profile?.id]);
  const apply = (x: Awaited<ReturnType<typeof load>>) => { setPasses(x.p); setChildren(x.c); setLoading(false); };
  useEffect(() => {
    let off = false;
    load().then((x) => !off && apply(x));
    return () => { off = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = async () => apply(await load());

  useEffect(() => {
    if (!showing) return;
    void QRCode.toDataURL(`ERP-PASS:${showing.code}`, { width: 260, margin: 1 }).then(setQr);
  }, [showing]);

  const childName = (id?: string) => {
    const c = children.find((x) => x.student_id === id);
    return (c?.profiles as Row | undefined)?.full_name ?? "—";
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row: Row = { kind: f.kind, person_name: f.person_name.trim(), person_phone: f.person_phone.trim() || null, purpose: f.purpose.trim() || null, valid_on: f.valid_on };
    if (f.kind === "visit") row.host_id = profile?.id;
    else row.student_id = f.student_id || children[0]?.student_id;
    const { data, error } = await supabase.from("gate_passes").insert(row).select().single();
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Pass created. Share the code with {name}.", { name: row.person_name }));
    setCreating(false);
    setShowing(data);
    void reload();
  };
  const share = async (p: Row) => {
    const text = t("Your pass for the school gate on {day}: code {code}", { day: fmtDate(p.valid_on), code: p.code });
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast(t("Copied.")); }
    } catch {}
  };
  const cancel = async (p: Row) => {
    if (!confirmAction(t("Cancel this pass?"))) return;
    const { error } = await supabase.rpc("cancel_gate_pass", { p_id: p.id });
    if (error) return toast(errorMessage(error), "error");
    toast(t("Pass cancelled."));
    void reload();
  };

  const lookup = async (value: string) => {
    const c = value.trim().replace(/^ERP-PASS:/i, "");
    if (!c) return;
    const { data, error } = await supabase.rpc("gate_lookup", { p_code: c });
    if (error) return toast(errorMessage(error), "error");
    const g = data as Row;
    if (!g.found) {
      setFound(null);
      return toast(t("No pass with that code."), "error");
    }
    setFound(g);
  };
  const check = async (action: "arrive" | "leave") => {
    if (!found) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("gate_check", { p_code: found.code, p_action: action });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setFound(data as Row);
    toast(action === "arrive" ? t("Checked in.") : t("Checked out."));
  };

  // Scan a pass's QR code with the camera (where the browser supports it).
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;
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
          const hit = (await detector.detect(video).catch(() => [])).find((x) => x.rawValue.startsWith("ERP-PASS:"));
          if (hit) {
            setScanning(false);
            setCode(hit.rawValue.slice(9));
            await lookup(hit.rawValue);
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
      stream?.getTracks().forEach((x) => x.stop());
    };
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!staff && !parent) return <AccessDenied message="Gate passes are for staff and parents." />;

  const today = passes.filter((p) => p.valid_on === localDate() && p.status !== "cancelled");
  const mine = passes.filter((p) => p.created_by === profile?.id || p.host_id === profile?.id);

  return (
    <ModuleShell
      title="Gate"
      icon={DoorOpen}
      tabs={[
        ...(staff ? [{ id: "desk" as TabId, label: "Gate desk", icon: ScanLine }] : []),
        { id: "passes" as TabId, label: staff ? "My visitor passes" : "Pickup passes", icon: IdCard },
      ]}
      activeTab={tab}
      onTab={setTab}
      action={tab === "passes" && <ActionButton icon={Plus} onClick={() => setCreating(true)}>{staff ? "New visitor pass" : "New pickup pass"}</ActionButton>}
    >
      {creating && (
        <Modal title={staff ? "New visitor pass" : "New pickup pass"} icon={IdCard} onClose={() => setCreating(false)}>
          <form onSubmit={create} className="space-y-4">
            {parent && (
              <Field label="Child">
                <select required className={inputClass} value={f.student_id || children[0]?.student_id || ""} onChange={(e) => setF({ ...f, student_id: e.target.value })}>
                  {children.map((c) => <option key={c.student_id} value={c.student_id}>{(c.profiles as Row | undefined)?.full_name}</option>)}
                </select>
              </Field>
            )}
            <Field label={staff ? "Visitor's name" : "Name of the person collecting"}><input required className={inputClass} value={f.person_name} onChange={(e) => setF({ ...f, person_name: e.target.value })} /></Field>
            <Field label="Their phone (optional)"><input className={inputClass} inputMode="tel" value={f.person_phone} onChange={(e) => setF({ ...f, person_phone: e.target.value })} /></Field>
            {staff && <Field label="Purpose"><input className={inputClass} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder={t("e.g. interview")} /></Field>}
            <Field label="Day"><input type="date" required min={localDate()} className={inputClass} value={f.valid_on} onChange={(e) => setF({ ...f, valid_on: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Create pass</SubmitButton>
          </form>
        </Modal>
      )}
      {showing && (
        <Modal title={t("Pass for {name}", { name: showing.person_name })} icon={IdCard} onClose={() => setShowing(null)}>
          <div className="text-center space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data: URL */}
            {qr && <img src={qr} alt={t("Pass QR code")} className="w-52 h-52 mx-auto rounded-2xl border" />}
            <p className="text-4xl font-black tracking-widest font-mono" data-testid="pass-code">{showing.code}</p>
            <p className="text-sm text-slate-500">{fmtDate(showing.valid_on)}{showing.kind === "pickup" ? ` · ${t("collecting")} ${childName(showing.student_id)}` : ""}</p>
            <button onClick={() => share(showing)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold inline-flex items-center gap-2"><Copy size={16} /> {t("Share code")}</button>
          </div>
        </Modal>
      )}

      {loading ? <Loading /> : tab === "desk" ? (
        <div className="space-y-6">
          <Card title="Check a pass">
            <form onSubmit={(e) => { e.preventDefault(); void lookup(code); }} className="flex flex-wrap gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label={t("Pass code")} placeholder="AB12CD34"
                className="flex-1 min-w-40 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-mono tracking-widest" />
              <button type="submit" className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-2"><Search size={16} /> {t("Check")}</button>
              {canScan && <button type="button" onClick={() => setScanning((s) => !s)} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2"><ScanLine size={16} /> {scanning ? t("Stop camera") : t("Scan QR")}</button>}
            </form>
            {scanning && <video ref={videoRef} muted playsInline className="mt-4 w-full max-w-sm rounded-2xl bg-black" />}
            {found && (
              <div className="mt-5 p-5 rounded-2xl border-2 border-indigo-100 space-y-2" role="status">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={found.kind === "visit" ? "purple" : "blue"}>{t(found.kind === "visit" ? "visitor" : "pickup")}</Badge>
                  <Badge color={STATUS_COLOR[found.status]}>{t(found.status)}</Badge>
                  {!found.valid_today && <Badge color="red">{t("not valid today")}</Badge>}
                </div>
                <p className="text-xl font-black text-slate-800">{found.person_name}</p>
                {found.person_phone && <p className="text-sm text-slate-500">{found.person_phone}</p>}
                <p className="text-sm">{found.kind === "visit" ? <>{t("Visiting")} <b>{found.host}</b>{found.purpose ? ` · ${found.purpose}` : ""}</> : <>{t("Collecting")} <b>{found.student}</b></>}</p>
                <p className="text-xs text-slate-400">{fmtDate(found.valid_on)}{found.arrived_at ? ` · ${t("in")} ${fmtDateTime(found.arrived_at)}` : ""}{found.left_at ? ` · ${t("out")} ${fmtDateTime(found.left_at)}` : ""}</p>
                {found.valid_today && (
                  <div className="flex gap-2 pt-2">
                    {found.status === "expected" && <button disabled={busy} onClick={() => check("arrive")} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold flex items-center gap-2"><LogIn size={16} /> {t("Check in")}</button>}
                    {found.status !== "left" && <button disabled={busy} onClick={() => check("leave")} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-2"><LogOut size={16} /> {found.kind === "pickup" ? t("Let out with the child") : t("Check out")}</button>}
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card title="Expected today">
            {today.length === 0 ? <p className="text-sm text-slate-400">{t("Nobody is expected today.")}</p> : (
              <div className="space-y-2">
                {today.map((p) => (
                  <button key={p.id} onClick={() => { setCode(p.code); void lookup(p.code); }} className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                    <Badge color={STATUS_COLOR[p.status]}>{t(p.status)}</Badge>
                    <span className="font-bold text-slate-800">{p.person_name}</span>
                    <span className="text-xs text-slate-500">{p.kind === "visit" ? t("visitor") : t("pickup")}</span>
                    <span className="ml-auto font-mono text-xs text-slate-400">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : mine.length === 0 ? (
        <Empty>{staff ? "No visitor passes. Create one so the gate knows who to expect." : "No pickup passes. Create one when someone else collects your child."}</Empty>
      ) : (
        <div className="space-y-3">
          {mine.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center gap-3">
                <Badge color={STATUS_COLOR[p.status]}>{t(p.status)}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800">{p.person_name}</p>
                  <p className="text-xs text-slate-500">{fmtDate(p.valid_on)}{p.kind === "pickup" ? ` · ${t("collecting")} ${childName(p.student_id)}` : p.purpose ? ` · ${p.purpose}` : ""}</p>
                </div>
                <button onClick={() => setShowing(p)} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold font-mono">{p.code}</button>
                {p.status === "expected" && <button onClick={() => cancel(p)} aria-label={t("Cancel")} className="text-slate-400 hover:text-red-600"><X size={16} /></button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}
