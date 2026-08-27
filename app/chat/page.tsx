import { Search, Hash, Plus, Video, Phone, MoreVertical, Paperclip, Send, Smile, Users, FileText } from "lucide-react";

export default function ChatPortal() {
  return (
    <>
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
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
          {/* Channels */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Channels</h3>
            <ul className="space-y-1">
              <li>
                <button className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold rounded-xl bg-linear-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-[0_4px_12px_rgba(59,130,246,0.1)]">
                  <span className="flex items-center gap-2"><Hash size={16} className="text-blue-500" /> general</span>
                  <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-md">3</span>
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl text-slate-500 hover:bg-slate-50 transition-all">
                  <Hash size={16} className="text-slate-400" /> faculty-lounge
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl text-slate-500 hover:bg-slate-50 transition-all">
                  <Hash size={16} className="text-slate-400" /> mech-engineering-101
                </button>
              </li>
            </ul>
          </div>

          {/* Direct Messages */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Direct Messages</h3>
            <ul className="space-y-1">
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-xl text-slate-600 hover:bg-slate-50 transition-all">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-pink-400 to-orange-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">SJ</div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
                  </div>
                  Sarah Jenkins
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-xl text-slate-600 hover:bg-slate-50 transition-all">
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
        
        {/* Chat Header */}
        <header className="h-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-8 shrink-0 sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Hash size={20} className="text-blue-500" /> general
            </h2>
            <p className="text-xs font-medium text-slate-500">Company-wide announcements and team chatter</p>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <div className="flex -space-x-2 mr-4">
               <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white"></div>
               <div className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white"></div>
               <div className="w-8 h-8 rounded-full bg-slate-400 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">+12</div>
            </div>
            <button className="hover:text-blue-600 transition-colors"><Phone size={20} /></button>
            <button className="hover:text-blue-600 transition-colors"><Video size={20} /></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button className="hover:text-blue-600 transition-colors"><MoreVertical size={20} /></button>
          </div>
        </header>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* Time Divider */}
          <div className="flex items-center justify-center">
            <span className="bg-white border border-slate-200 text-slate-400 text-xs font-bold px-4 py-1 rounded-full shadow-sm">Today</span>
          </div>

          {/* Message (Other Person) */}
          <div className="flex gap-4 max-w-3xl">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-pink-400 to-orange-400 shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1">SJ</div>
            <div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold text-slate-800">Sarah Jenkins</span>
                <span className="text-[10px] font-semibold text-slate-400">10:42 AM</span>
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-slate-600 text-sm leading-relaxed">
                Hey everyone! Just a heads up that the new course materials for the Advanced Mechatronics module have been uploaded. 
              </div>
            </div>
          </div>

          {/* Message with Attachment (Other Person) */}
          <div className="flex gap-4 max-w-3xl">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-cyan-400 to-blue-500 shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1">MC</div>
            <div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold text-slate-800">Marcus Chen</span>
                <span className="text-[10px] font-semibold text-slate-400">11:15 AM</span>
              </div>
              <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-slate-600 text-sm leading-relaxed">
                Awesome, thanks Sarah! I've attached the kinematic solver notes from yesterday's lab session for anyone who needs them.
                
                {/* Attachment Card */}
                <div className="mt-3 flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FileText size={20} /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Kinematic_Solver_Notes.pdf</p>
                    <p className="text-xs text-slate-500">1.2 MB</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Message (Self - Vibrant) */}
          <div className="flex gap-4 max-w-3xl self-end ml-auto flex-row-reverse">
            <div className="w-10 h-10 rounded-full bg-slate-800 shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-md mt-1">You</div>
            <div className="flex flex-col items-end">
              <div className="flex items-baseline gap-2 mb-1 flex-row-reverse">
                <span className="font-bold text-slate-800">You</span>
                <span className="text-[10px] font-semibold text-slate-400">11:20 AM</span>
              </div>
              <div className="bg-linear-to-r from-blue-600 to-indigo-600 p-4 rounded-2xl rounded-tr-none shadow-[0_8px_16px_rgba(79,70,229,0.2)] text-white text-sm leading-relaxed">
                Perfect. I will add these to the main curriculum dashboard this afternoon. 🚀
              </div>
            </div>
          </div>

        </div>

        {/* Message Input Box */}
        <div className="p-6 bg-white/60 backdrop-blur-md border-t border-slate-200/50 shrink-0">
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-200 p-2 flex items-end gap-2 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all">
            <button className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0">
              <Paperclip size={20} />
            </button>
            
            <textarea 
              placeholder="Message #general..." 
              className="w-full max-h-32 min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-3 text-sm text-slate-800 outline-none"
              rows={1}
            />
            
            <div className="flex items-center gap-1 shrink-0 pb-1 pr-1">
              <button className="p-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 rounded-xl transition-colors">
                <Smile size={20} />
              </button>
              <button className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition-colors group">
                <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </div>

      </main>
    </>
  );
}