"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Hash, Plus, Video, Phone, MoreVertical, Paperclip, Send, Smile, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ChatPortal() {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // NEW: Channel Navigation State
  const [activeChannel, setActiveChannel] = useState("general");
  const [isDM, setIsDM] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reload messages from the cloud whenever the channel changes
  useEffect(() => {
    loadMessages();
  }, [activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', activeChannel) // Filter by active room!
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
    setIsLoading(false);
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSending(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{ 
        sender_name: 'You', 
        message: newMessage, 
        channel: activeChannel // Save to current room!
      }])
      .select();

    if (!error && data) {
      setMessages([...messages, data[0]]);
      setNewMessage("");
    }
    setIsSending(false);
  };

  const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

  // Helper to switch channels
  const switchChannel = (channelName: string, dm: boolean = false) => {
    setActiveChannel(channelName);
    setIsDM(dm);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative">
      {/* CONTEXTUAL SIDEBAR - Channels and DMs */}
      <aside className="w-72 bg-white/80 backdrop-blur-xl border-r border-slate-100 flex flex-col shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Messages</h2>
          <button className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
            <Plus size={18} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="relative w-full mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search chats..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
          {/* Channels */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Channels</h3>
            <ul className="space-y-1">
              <li>
                <button 
                  onClick={() => switchChannel("general")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === "general" ? "bg-lanraro-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 font-semibold"}`}
                >
                  <span className="flex items-center gap-2"><Hash size={16} className={activeChannel === "general" ? "text-blue-500" : "text-slate-400"} /> general</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => switchChannel("faculty-lounge")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === "faculty-lounge" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 font-semibold"}`}
                >
                  <span className="flex items-center gap-2"><Hash size={16} className={activeChannel === "faculty-lounge" ? "text-blue-500" : "text-slate-400"} /> faculty-lounge</span>
                </button>
              </li>
              <li>
                <button 
                  onClick={() => switchChannel("mech-engineering-101")}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === "mech-engineering-101" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 font-semibold"}`}
                >
                  <span className="flex items-center gap-2"><Hash size={16} className={activeChannel === "mech-engineering-101" ? "text-blue-500" : "text-slate-400"} /> mech-engineering-101</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Direct Messages */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Direct Messages</h3>
            <ul className="space-y-1">
              <li>
                <button 
                  onClick={() => switchChannel("Sarah Jenkins", true)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === "Sarah Jenkins" ? "bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:bg-slate-50 font-semibold"}`}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">SJ</div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
                  </div>
                  Sarah Jenkins
                </button>
              </li>
              <li>
                <button 
                  onClick={() => switchChannel("Marcus Chen", true)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-all ${activeChannel === "Marcus Chen" ? "bg-lanraro-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:bg-slate-50 font-semibold"}`}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">MC</div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
                  </div>
                  Marcus Chen
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 bg-[#F4F7FE] flex flex-col min-w-0 relative">
        
        {/* Dynamic Chat Header */}
        <header className="h-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {!isDM ? <Hash size={20} className="text-blue-500" /> : <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px]">{getInitials(activeChannel)}</div>} 
              {activeChannel}
            </h2>
            <p className="text-xs font-medium text-slate-500">
              {isDM ? `Direct Message with ${activeChannel}` : `Team chatter and updates for #${activeChannel}`}
            </p>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            {!isDM && (
              <div className="flex -space-x-2 mr-4">
                 <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white"></div>
                 <div className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white"></div>
                 <div className="w-8 h-8 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">+12</div>
              </div>
            )}
            <button className="hover:text-blue-600 transition-colors"><Phone size={20} /></button>
            <button className="hover:text-blue-600 transition-colors"><Video size={20} /></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button className="hover:text-blue-600 transition-colors"><MoreVertical size={20} /></button>
          </div>
        </header>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex items-center justify-center">
            <span className="bg-white border border-slate-200 text-slate-400 text-xs font-bold px-4 py-1 rounded-full shadow-sm">
              {isDM ? `Conversation started with ${activeChannel}` : `Welcome to the #${activeChannel} channel!`}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center p-4 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center p-12 text-slate-400 text-sm">No messages here yet. Be the first to say hello!</div>
          ) : (
            messages.map((msg) => {
              const isSelf = msg.sender_name === 'You';
              
              return isSelf ? (
                // SELF MESSAGE
                <div key={msg.id} className="flex gap-4 max-w-3xl self-end ml-auto flex-row-reverse">
                  <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1">
                    {getInitials(msg.sender_name)}
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-2 mb-1 flex-row-reverse">
                      <span className="font-bold text-slate-800">{msg.sender_name}</span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="bg-lanraro-r from-blue-600 to-indigo-600 p-4 rounded-2xl rounded-tr-none shadow-md text-white text-sm leading-relaxed">
                      {msg.message}
                    </div>
                  </div>
                </div>
              ) : (
                // OTHER PERSON MESSAGE
                <div key={msg.id} className="flex gap-4 max-w-3xl">
                  <div className="w-10 h-10 rounded-full bg-lanraro-br from-pink-400 to-orange-400 shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1">
                    {getInitials(msg.sender_name)}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-bold text-slate-800">{msg.sender_name}</span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-slate-600 text-sm leading-relaxed">
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Message Input Box */}
        <form onSubmit={handleSendMessage} className="p-6 bg-white/60 backdrop-blur-md border-t border-slate-200/50 shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex items-center gap-2 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
            <button type="button" className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0">
              <Paperclip size={20} />
            </button>
            
            <input 
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={`Message ${isDM ? '@' : '#'}${activeChannel}...`}
              className="w-full bg-transparent border-none focus:ring-0 py-3 text-sm text-slate-800 outline-none"
            />
            
            <div className="flex items-center gap-1 shrink-0 pr-1">
              <button type="button" className="p-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-xl transition-colors">
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