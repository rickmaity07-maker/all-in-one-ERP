"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, Radio, Square, Plus, Trash2, LocateFixed, ExternalLink, Bus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Modal, Field, SubmitButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, openExternal, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Point = { lat: number; lng: number };
const km = (a: Point | Row, b: Point | Row) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// Same rule as the server's alerts: the bus's own speed when realistic, otherwise 20 km/h door to door.
const etaMin = (dist: number, speed?: number | null) => Math.max(1, Math.ceil((dist / (speed && speed >= 5 && speed <= 90 ? speed : 20)) * 60));
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;
};

// Live position of every bus (realtime), shared by the page.
export function useBusLocations() {
  const [locations, setLocations] = useState<Record<string, Row>>({});
  useEffect(() => {
    let off = false;
    supabase.from("bus_locations").select("*").then(({ data }) => !off && setLocations(Object.fromEntries((data ?? []).map((l) => [l.route_id, l]))));
    const channel = supabase
      .channel("bus-locations")
      .on("postgres_changes", { event: "*", schema: "public", table: "bus_locations" }, (p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as Row;
        if (!row?.route_id) return;
        setLocations((prev) => {
          const next = { ...prev };
          if (p.eventType === "DELETE") delete next[row.route_id];
          else next[row.route_id] = row;
          return next;
        });
      })
      .subscribe();
    return () => {
      off = true;
      void supabase.removeChannel(channel);
    };
  }, []);
  return locations;
}

// Where the bus is along its stops, and when it reaches each one still ahead.
export function LiveRoute({ stops, location, myStopIds }: { stops: Row[]; location?: Row; myStopIds: string[] }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const ordered = [...stops].sort((a, b) => a.seq - b.seq);
  const active = location?.trip_active && now - new Date(location.updated_at).getTime() < 10 * 60 * 1000;
  if (!ordered.length && !active) return null;

  const pos = active ? { lat: location!.lat, lng: location!.lng } : null;
  // The stop the bus is closest to; stops before it are treated as passed.
  const nearest = pos && ordered.length ? ordered.reduce((best, s, i) => (km(pos, s) < km(pos, ordered[best]) ? i : best), 0) : -1;
  const passedIdx = pos && nearest > 0 && km(pos, ordered[nearest]) > 0.15 && nearest < ordered.length - 1
    && km(pos, ordered[nearest + 1]) < km(ordered[nearest], ordered[nearest + 1]) ? nearest : nearest - 1;

  return (
    <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        {active ? (
          <span className="flex items-center gap-2 font-bold text-emerald-700"><Radio size={16} className="animate-pulse" /> {t("Live")} · {t("updated {t} ago", { t: ago(location!.updated_at, now) })}</span>
        ) : (
          <span className="text-slate-500 font-semibold">{t("Not on the road right now.")}</span>
        )}
        {active && (
          <button onClick={() => openExternal(`https://www.openstreetmap.org/?mlat=${location!.lat}&mlon=${location!.lng}#map=16/${location!.lat}/${location!.lng}`)} className="text-xs font-bold text-indigo-600 flex items-center gap-1">
            <ExternalLink size={12} /> {t("Open map")}
          </button>
        )}
      </div>
      {ordered.length > 0 && (
        <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
          {ordered.map((s, i) => {
            const ahead = pos && i > passedIdx;
            const eta = ahead ? etaMin(km(pos!, s), location?.speed_kmh) : null;
            const busHere = pos && i === nearest && km(pos, s) < 0.15;
            const mine = myStopIds.includes(s.id);
            return (
              <li key={s.id} className="ml-4">
                <span className={`absolute -left-2 w-3.5 h-3.5 rounded-full border-2 ${busHere ? "bg-emerald-500 border-emerald-500" : pos && i <= passedIdx ? "bg-slate-300 border-slate-300" : "bg-white border-indigo-400"}`} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`font-semibold ${pos && i <= passedIdx ? "text-slate-400" : "text-slate-800"}`}>{s.name}</span>
                  {mine && <span className="text-[10px] font-black uppercase bg-indigo-600 text-white rounded px-1.5 py-0.5">{t("your stop")}</span>}
                  {busHere && <span className="text-xs font-bold text-emerald-700 flex items-center gap-1"><Bus size={12} /> {t("bus is here")}</span>}
                  {eta != null && !busHere && <span className={`text-xs font-bold ${mine && eta <= 5 ? "text-orange-600" : "text-slate-500"}`}>{t("~{n} min", { n: eta })}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// For the route's driver: shares the phone's position while a trip is running.
export function DriverControls({ route, location }: { route: Row; location?: Row }) {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [lastSent, setLastSent] = useState<string>("");
  const watch = useRef<number | null>(null);
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const last = useRef(0);

  const stopWatching = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void lock.current?.release().catch(() => {});
    lock.current = null;
  };
  useEffect(() => stopWatching, []);

  const start = async () => {
    if (!navigator.geolocation) return toast(t("This device can't share its location."), "error");
    // Keep the screen on so the phone doesn't stop sending while driving.
    try {
      lock.current = await (navigator as unknown as { wakeLock: { request(k: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen");
    } catch {}
    setRunning(true);
    watch.current = navigator.geolocation.watchPosition(
      async (p) => {
        if (Date.now() - last.current < 8000) return;
        last.current = Date.now();
        const speed = p.coords.speed != null ? Math.round(p.coords.speed * 3.6) : null;
        const { data, error } = await supabase.rpc("report_bus_location", { p_route: route.id, p_lat: p.coords.latitude, p_lng: p.coords.longitude, p_speed: speed });
        if (error) toast(errorMessage(error), "error");
        else setLastSent(new Date().toLocaleTimeString() + ((data as Row)?.alerts ? ` · ${t("{n} stop alert(s) sent", { n: (data as Row).alerts })}` : ""));
      },
      (err) => {
        toast(err.code === err.PERMISSION_DENIED ? t("Location permission was refused.") : t("Can't get a location fix yet."), "error");
        if (err.code === err.PERMISSION_DENIED) {
          stopWatching();
          setRunning(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  };
  const stop = async () => {
    stopWatching();
    setRunning(false);
    const { error } = await supabase.rpc("end_bus_trip", { p_route: route.id });
    if (error) toast(errorMessage(error), "error");
    else toast(t("Trip ended."));
  };

  return (
    <div className="mt-4 p-4 rounded-2xl border-2 border-dashed border-indigo-200 flex flex-wrap items-center gap-3">
      <Navigation size={18} className="text-indigo-600" />
      <span className="text-sm font-bold text-slate-700 flex-1 min-w-40">{running ? t("Sharing this bus's position. Keep the app open while driving.") : t("You drive this route.")}</span>
      {lastSent && <span className="text-xs text-slate-500">{t("Last sent")} {lastSent}</span>}
      {running || location?.trip_active ? (
        <button onClick={stop} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center gap-2"><Square size={14} /> {t("End trip")}</button>
      ) : null}
      {!running && (
        <button onClick={start} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2"><Radio size={14} /> {t("Start trip")}</button>
      )}
    </div>
  );
}

// Staff: the route's stops with their map positions (used for arrival times and alerts).
export function StopsEditor({ route, stops, onChange, onClose }: { route: Row; stops: Row[]; onChange: () => void; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: "", lat: "", lng: "" });
  const [busy, setBusy] = useState(false);
  const ordered = [...stops].sort((a, b) => a.seq - b.seq);

  const here = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => toast(t("Location is not available on this device."), "error"),
    );
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(f.lat), lng = Number(f.lng);
    if (!f.lat || !f.lng || isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return toast(t("Enter the stop's latitude and longitude."), "error");
    setBusy(true);
    const { error } = await supabase.from("transport_stops").insert({ route_id: route.id, seq: (ordered.at(-1)?.seq ?? 0) + 1, name: f.name.trim(), lat, lng });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    setF({ name: "", lat: "", lng: "" });
    onChange();
  };
  const remove = async (s: Row) => {
    if (!confirmAction(`Remove ${s.name}?`)) return;
    const { error } = await supabase.from("transport_stops").delete().eq("id", s.id);
    if (error) return toast(errorMessage(error), "error");
    onChange();
  };

  return (
    <Modal title={`Stops — ${route.name}`} icon={MapPin} onClose={onClose} wide>
      <ol className="space-y-2 mb-6">
        {ordered.length === 0 && <li className="text-sm text-slate-400">{t("No stops yet. Add them in the order the bus visits them.")}</li>}
        {ordered.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm p-2 rounded-xl border border-slate-100">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{s.seq}</span>
            <span className="font-semibold flex-1">{s.name}</span>
            <span className="text-xs font-mono text-slate-400">{Number(s.lat).toFixed(4)}, {Number(s.lng).toFixed(4)}</span>
            <button onClick={() => remove(s)} aria-label={t("Remove")} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
          </li>
        ))}
      </ol>
      <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <Field label="Stop name"><input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Latitude"><input className={inputClass} inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="22.5726" /></Field>
        <Field label="Longitude"><input className={inputClass} inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="88.3639" /></Field>
        <div className="flex gap-2">
          <button type="button" onClick={here} title={t("Use my current location")} className="mt-4 px-3 rounded-xl bg-slate-100 text-slate-700"><LocateFixed size={18} /></button>
          <SubmitButton busy={busy}><Plus size={16} /> Add stop</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
