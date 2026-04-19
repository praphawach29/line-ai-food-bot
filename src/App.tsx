import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Settings, 
  MessageSquare, 
  ShoppingBag, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ChevronRight,
  Database,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-slate-200 p-6 hidden md:block">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Bot className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl tracking-tight text-slate-800">Nida AI Admin</h1>
        </div>

        <nav className="space-y-1">
          <SidebarItem icon={<MessageSquare size={18} />} label="Live Chat" active />
          <SidebarItem icon={<ShoppingBag size={18} />} label="Orders" />
          <SidebarItem icon={<Database size={18} />} label="Menu Manager" />
          <SidebarItem icon={<Users size={18} />} label="Customers" />
          <div className="pt-6 mt-6 border-t border-slate-100">
            <SidebarItem icon={<Settings size={18} />} label="Settings" />
          </div>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <p className="text-sm font-medium">System Online</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:ml-64 p-6 md:p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-800">Dashboard</h2>
            <p className="text-slate-500">Welcome back, Managing ร้านข้าวต้มนิดา</p>
          </div>
          <button 
            onClick={fetchStatus}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <StatusCard 
            title="LINE Webhook" 
            status="Healthy" 
            desc="Ready for incoming events"
            icon={<CheckCircle2 className="text-emerald-500" />}
            bgColor="bg-emerald-50"
          />
          <StatusCard 
            title="AI Engine" 
            status={status?.ai_provider || 'Gemini'} 
            desc="Optimized for Thai food recs"
            icon={<Cpu className="text-indigo-500" />}
            bgColor="bg-indigo-50"
          />
          <StatusCard 
            title="Database" 
            status="Connected" 
            desc="Supabase sync active"
            icon={<Database className="text-amber-500" />}
            bgColor="bg-amber-50"
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Debug Panel */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800">Connection Debugger</h3>
              <span className="text-xs bg-slate-100 px-2 py-1 rounded-full text-slate-500 font-mono">
                {status?.time?.split('T')[1].split('.')[0] || '--:--:--'}
              </span>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Use this panel to verify your LINE bot configuration.
              </p>
              
              <div className="space-y-4">
                <DebugRow 
                  label="LINE Channel Secret" 
                  isSet={true} 
                  value="Configured (Safe)"
                />
                <DebugRow 
                  label="LINE Access Token" 
                  isSet={true} 
                  value="Configured (Safe)"
                />
                <DebugRow 
                  label="Supabase URL" 
                  isSet={true} 
                  value="ais-app.supabase.co"
                />
                <div className="pt-4">
                  <div className="bg-slate-50 rounded-lg p-4 font-mono text-xs text-slate-500 break-all">
                    Webhook URL: {window.location.origin}/webhook
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic px-1">
                    * Paste this URL into your LINE Developer Console under "Webhook URL"
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Activity / Suggestions */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-6">Recent Activity</h3>
            <div className="space-y-6">
              <ActivityItem 
                title="New Order #ORD-202404-1234"
                time="2 mins ago"
                desc="Customer just sent a payment slip."
                type="order"
              />
              <ActivityItem 
                title="AI Recommendation"
                time="15 mins ago"
                desc="User 'Jack' asked for low-calorie menu."
                type="ai"
              />
              <ActivityItem 
                title="System Update"
                time="1 hour ago"
                desc="Switched AI provider to Gemini Flash."
                type="system"
              />
            </div>
            <button className="w-full mt-8 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 text-sm font-medium transition-colors border border-slate-200">
              View All Logs
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`
      flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer font-medium text-sm transition-all
      ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}
    `}>
      {icon}
      {label}
    </div>
  );
}

function StatusCard({ title, status, desc, icon, bgColor }: { title: string, status: string, desc: string, icon: React.ReactNode, bgColor: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-default">
      <div className={`${bgColor} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h4 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{title}</h4>
      <p className="text-xl font-bold text-slate-800 mb-1">{status}</p>
      <p className="text-xs text-slate-400 line-clamp-1">{desc}</p>
    </div>
  );
}

function DebugRow({ label, isSet, value }: { label: string, isSet: boolean, value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50">
      <div className="flex items-center gap-2">
        {isSet ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-amber-500" />}
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className={`text-xs ${isSet ? 'text-slate-400' : 'text-amber-600 font-bold'}`}>
        {value}
      </span>
    </div>
  );
}

function ActivityItem({ title, time, desc, type }: { title: string, time: string, desc: string, type: string }) {
  return (
    <div className="flex gap-4 group">
      <div className="relative">
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center relative z-10
          ${type === 'order' ? 'bg-emerald-100 text-emerald-600' : type === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}
        `}>
          {type === 'order' ? <ShoppingBag size={14} /> : type === 'ai' ? <Cpu size={14} /> : <Settings size={14} />}
        </div>
        <div className="absolute top-8 bottom--6 left-1/2 w-px bg-slate-100 -translate-x-1/2 group-last:hidden" />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start mb-0.5">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          <span className="text-[10px] text-slate-400 font-medium">{time}</span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
