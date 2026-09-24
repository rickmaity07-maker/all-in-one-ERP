"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Hash, Plus, Paperclip, Send, Smile, Loader2, Trash2, FileText, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff, isAdmin } from "@/lib/session";
import { Modal, Field, SubmitButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, initials, openStoredFile, removeStoredFile, uploadFile, type Row } from "@/lib/utils";

const EMOJIS = ["😀", "😂", "👍", "🙏", "🎉", "❤️", "🔥", "👀", "✅", "❌", "🤔", "🚀"];
const BUCKET = "chat-files";

const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;

export default function ChatPortal() {
  const { profile, role } = useSession();
  const me = profile!;
  const [channels, setChannels] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [messages, setMessages] = useState<Row[]>([]);
  const [activeChannel, setActiveChannel] = useState("general");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [channelForm, setChannelForm] = useState({ name: "", description: "" });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const openChannel = (name: string) => {
    if (name === activeChannel) return;
    setIsLoading(true);
    setActiveChannel(name);
  };

  const isDM = activeChannel.startsWith("dm:");
  const dmPartner = isDM ? people.find((p) => activeChannel.includes(p.id) && p.id !== me.id) : null;
  const title = isDM ? dmPartner?.full_name ?? "Direct message" : activeChannel;

  useEffect(() => {
    supabase.from("chat_channels").select("*").order("name").then(({ data }) => setChannels(data ?? []));
    supabase.from("profiles").select("id, full_name, role").neq("id", me.id).order("full_name").then(({ data }) => setPeople(data ?? []));
  }, [me.id]);

  // Load history and subscribe to new/deleted messages for the active room.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("chat_messages")
      .select("*")
      .eq("channel", activeChannel)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast(errorMessage(error), "error");
        setMessages(data ?? []);
        setIsLoading(false);
      });

    const sub = supabase
      .channel(`room-${activeChannel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel=eq.${activeChannel}` }, (payload) => {
        setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new as Row]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as Row).id));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string, attachment_path: string | null = null) => {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([{ sender_id: me.id, sender_name: me.full_name, message: text, channel: activeChannel, attachment_path }])
      .select();
    if (error) {
      toast(errorMessage(error), "error");
      return false;
    }
    if (data) setMessages((prev) => (prev.some((m) => m.id === data[0].id) ? prev : [...prev, data[0]]));
    return true;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setIsSending(true);
    if (await send(newMessage.trim())) setNewMessage("");
    setIsSending(false);
    setShowEmoji(false);
  };

  const handleAttach = async (file: File | undefined) => {
    if (!file) return;
    setIsSending(true);
    try {
      const path = await uploadFile(BUCKET, file, activeChannel.replace(/:/g, "_"));
      await send(`📎 ${file.name}`, path);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setIsSending(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (msg: Row) => {
    if (!confirmAction("Delete this message?")) return;
    const { error } = await supabase.from("chat_messages").delete().eq("id", msg.id);
    if (error) return toast(errorMessage(error), "error");
    await removeStoredFile(BUCKET, msg.attachment_path);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = channelForm.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    if (!name || name.startsWith("dm")) return toast("Pick a different channel name.", "error");
    const { data, error } = await supabase.from("chat_channels").insert([{ name, description: channelForm.description || null }]).select();
    if (error) return toast(errorMessage(error), "error");
    setChannels((prev) => [...prev, data[0]].sort((a, b) => a.name.localeCompare(b.name)));
    setNewChannelOpen(false);
    setChannelForm({ name: "", description: "" });
    openChannel(name);
  };

  const visibleChannels = useMemo(
    () => channels.filter((c) => (c.name !== "faculty-lounge" || isStaff(role)) && c.name.includes(sidebarSearch.toLowerCase())),
    [channels, role, sidebarSearch]
  );
  const visiblePeople = people.filter((p) => p.full_name.toLowerCase().includes(sidebarSearch.toLowerCase()));
  const channelInfo = channels.find((c) => c.name === activeChannel);

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {newChannelOpen && (
        <Modal title="New Channel" icon={Hash} onClose={() => setNewChannelOpen(false)}>
          <form onSubmit={createChannel} className="space-y-4">
            <Field label="Channel Name"><input required className={inputClass} value={channelForm.name} onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })} placeholder="e.g. robotics-club" /></Field>
            <Field label="Description"><input className={inputClass} value={channelForm.description} onChange={(e) => setChannelForm({ ...channelForm, description: e.target.value })} /></Field>
            <SubmitButton busy={false}>Create Channel</SubmitButton>
          </form>
        </Modal>
      )}

      {/* CONTEXTUAL SIDEBAR - Channels and DMs */}
      <aside className="hidden md:flex w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Messages</h2>
          {isStaff(role) && (
            <button onClick={() => setNewChannelOpen(true)} title="New channel" className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
              <Plus size={18} />
            </button>
          )}
        </div>

        <div className="p-4">
          <div className="relative w-full mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search chats or people..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Channels</h3>
            <ul className="space-y-1">
              {visibleChannels.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openChannel(c.name)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === c.name ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 font-semibold"}`}
                  >
                    <span className="flex items-center gap-2">
                      {c.name === "faculty-lounge" ? <Lock size={14} className="text-slate-400" /> : <Hash size={16} className={activeChannel === c.name ? "text-blue-500" : "text-slate-400"} />} {c.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Direct Messages</h3>
            <ul className="space-y-1">
              {visiblePeople.map((p) => {
                const ch = dmChannel(me.id, p.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => openChannel(ch)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === ch ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:bg-slate-50 font-semibold"}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-linear-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">{initials(p.full_name)}</div>
                      <span className="truncate">{p.full_name}</span>
                      <span className="ml-auto text-[9px] uppercase text-slate-400">{p.role}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 relative">
        <header className="min-h-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between gap-3 px-4 md:px-8 py-3 shrink-0">
          <select
            aria-label="Conversation"
            value={activeChannel}
            onChange={(e) => openChannel(e.target.value)}
            className="md:hidden w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none"
          >
            <optgroup label="Channels">
              {visibleChannels.map((c) => <option key={c.id} value={c.name}>#{c.name}</option>)}
            </optgroup>
            <optgroup label="Direct messages">
              {visiblePeople.map((p) => <option key={p.id} value={dmChannel(me.id, p.id)}>{p.full_name}</option>)}
            </optgroup>
          </select>
          <div className="hidden md:block">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {!isDM ? <Hash size={20} className="text-blue-500" /> : <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px]">{initials(title)}</div>}
              {title}
            </h2>
            <p className="text-xs font-medium text-slate-500">{isDM ? `Private conversation with ${title}` : channelInfo?.description || `Team chatter and updates for #${activeChannel}`}</p>
          </div>
          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live</span>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          <div className="flex items-center justify-center">
            <span className="bg-white border border-slate-200 text-slate-400 text-xs font-bold px-4 py-1 rounded-full shadow-sm">
              {isDM ? `Conversation with ${title}` : `Welcome to the #${activeChannel} channel!`}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-4 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center p-12 text-slate-400 text-sm">No messages here yet. Be the first to say hello!</div>
          ) : (
            messages.map((msg) => {
              const isSelf = msg.sender_id ? msg.sender_id === me.id : msg.sender_name === "You";
              const canDelete = isSelf || isAdmin(role);
              return (
                <div key={msg.id} className={`flex gap-4 max-w-3xl group ${isSelf ? "ml-auto flex-row-reverse" : ""}`}>
                  <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1 ${isSelf ? "bg-slate-800" : "bg-linear-to-br from-pink-400 to-orange-400"}`}>
                    {initials(msg.sender_name)}
                  </div>
                  <div className={`flex flex-col ${isSelf ? "items-end" : ""}`}>
                    <div className={`flex items-baseline gap-2 mb-1 ${isSelf ? "flex-row-reverse" : ""}`}>
                      <span className="font-bold text-slate-800">{msg.sender_name}</span>
                      <span className="text-[10px] font-semibold text-slate-400">{new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      {canDelete && (
                        <button onClick={() => handleDelete(msg)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"><Trash2 size={12} /></button>
                      )}
                    </div>
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap wrap-break-word ${isSelf ? "bg-linear-to-r from-blue-600 to-indigo-600 rounded-tr-none shadow-md text-white" : "bg-white rounded-tl-none shadow-sm border border-slate-100 text-slate-600"}`}>
                      {msg.attachment_path ? (
                        <button onClick={() => openStoredFile(BUCKET, msg.attachment_path).catch((e) => toast(errorMessage(e), "error"))} className="flex items-center gap-2 underline font-semibold">
                          <FileText size={16} /> {msg.message.replace(/^📎\s*/, "")}
                        </button>
                      ) : (
                        msg.message
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-3 md:p-6 bg-white/60 backdrop-blur-md border-t border-slate-200/50 shrink-0 relative">
          {showEmoji && (
            <div className="absolute bottom-24 right-8 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 grid grid-cols-2 md:grid-cols-6 gap-1 z-20">
              {EMOJIS.map((em) => (
                <button key={em} type="button" onClick={() => setNewMessage((m) => m + em)} className="text-xl p-1.5 hover:bg-slate-100 rounded-lg">{em}</button>
              ))}
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex items-center gap-2 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
            <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file" className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0">
              <Paperclip size={20} />
            </button>
            <input ref={fileRef} type="file" hidden onChange={(e) => handleAttach(e.target.files?.[0])} />
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message ${isDM ? "@" : "#"}${title}...`}
              className="w-full bg-transparent border-none focus:ring-0 py-3 text-sm text-slate-800 outline-none"
            />
            <div className="flex items-center gap-1 shrink-0 pr-1">
              <button type="button" onClick={() => setShowEmoji((s) => !s)} className="p-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-xl transition-colors">
                <Smile size={20} />
              </button>
              <button type="submit" disabled={isSending} className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition-colors disabled:opacity-70">
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
