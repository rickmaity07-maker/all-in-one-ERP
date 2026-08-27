import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import GlobalSidebar from "../components/GlobalSidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All-In-One ERP",
  description: "Unified system architecture",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} h-screen flex flex-col overflow-hidden bg-[#F4F7FE]`}>
        
        {/* CUSTOM NATIVE TITLEBAR */}
        <div 
          data-tauri-drag-region 
          className="h-10 bg-linear-to-r from-[#2A0845] to-[#6441A5] border-b border-white/10 flex items-center justify-center px-4 text-xs font-semibold text-white/70 select-none shrink-0"
        >
          <span className="pointer-events-none">All-In-One ERP Workspace</span>
        </div>

        {/* MAIN APP CONTAINER */}
        <div className="flex-1 flex overflow-hidden">
          
          <GlobalSidebar />

          <div className="flex-1 flex overflow-hidden relative">
            {children}
          </div>

        </div>
      </body>
    </html>
  );
}
