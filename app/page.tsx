"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, Zap, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLiveLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    try {
      // 1. Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        const userId = authData.user.id;

        // 2. Query the profiles table without .single() to prevent JSON coercion crashes
        const { data: profileList, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId);

        let userRole = "owner"; // Default fallback to owner so you never get locked out

        if (profileError) {
          console.warn("Could not query profiles, proceeding with fallback:", profileError.message);
        } else if (profileList && profileList.length > 0) {
          userRole = profileList[0].role;
        } else {
          // Self-heal: automatically create the missing profile row in the database
          await supabase.from("profiles").upsert({
            id: userId,
            full_name: email.split("@")[0],
            role: "owner",
          });
        }

        // 3. Save role to localStorage for dashboard routing
        localStorage.setItem("erp_mock_role", userRole);
        
        // 4. Secure dynamic routing
        if (userRole === "owner" || userRole === "administration") {
          router.push("/admissions"); // Route admins to the CRM
        } else {
          router.push("/e-learning"); // Route teachers & students to their classes
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to authenticate. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 bg-[#F4F7FE] flex items-center justify-center relative overflow-hidden h-full w-full">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gradient-to-br from-cyan-400 to-blue-600 rounded-full blur-[120px] opacity-40 mix-blend-multiply"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gradient-to-br from-[#8A2387] to-[#E94057] rounded-full blur-[120px] opacity-40 mix-blend-multiply"></div>

      <div className="w-[850px] bg-white/60 backdrop-blur-2xl rounded-3xl shadow-[0_24px_48px_rgba(0,0,0,0.05)] border border-white flex overflow-hidden z-10">
        
        {/* Left Side: Branding */}
        <div className="w-1/2 bg-gradient-to-br from-[#2A0845] to-[#6441A5] p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-md shadow-inner border border-white/10">
              <Zap size={24} className="text-cyan-300" />
            </div>
            <h1 className="text-4xl font-black mb-4 leading-tight">Kern OS<br/>Architecture.</h1>
            <p className="text-white/70 font-medium leading-relaxed">
              Welcome back to the enterprise portal. Access your curriculum, track tasks, and manage operations from a single secure endpoint.
            </p>
          </div>

          <div className="relative z-10 text-xs font-bold tracking-wider text-white/50 uppercase">
            Database Connection: <span className="text-emerald-400 ml-1">Live</span>
          </div>
        </div>

        {/* Right Side: Live Login Form */}
        <div className="w-1/2 p-12 bg-white flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Secure Sign In</h2>
          <p className="text-sm font-medium text-slate-500 mb-8">Enter your credentials to access the cloud portal.</p>
          
          <form onSubmit={handleLiveLogin} className="space-y-4">
            {errorMsg && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-semibold">
                <AlertCircle size={18} className="shrink-0" />
                {errorMsg}
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email" 
                required
                placeholder="Email Address" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="password" 
                required
                placeholder="Password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-medium"
              />
            </div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-4 rounded-2xl text-sm font-bold shadow-md hover:bg-slate-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 size={16} className="animate-spin" /> Authenticating...</>
              ) : (
                <>Connect to Database <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}