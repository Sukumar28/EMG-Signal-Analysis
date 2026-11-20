import { useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Hand,
  LayoutDashboard,
  Menu,
  Upload,
  Waves,
  X,
} from 'lucide-react';
import type { NavPageId } from '../types/emg';

interface NavItem {
  id: NavPageId;
  label: string;
  section: string;
  icon: typeof LayoutDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', section: 'Overview', icon: LayoutDashboard },
  { id: 'analysis', label: 'Signal Analysis', section: 'Pipeline', icon: Activity },
  { id: 'recognition', label: 'Movement Recognition', section: 'Pipeline', icon: Hand },
  { id: 'visualization', label: 'Signal Visualization', section: 'Pipeline', icon: Waves },
  { id: 'performance', label: 'Model Performance', section: 'Machine Learning', icon: BarChart3 },
  { id: 'history', label: 'Analysis History', section: 'Records', icon: Clock },
  { id: 'about', label: 'About Project', section: 'Documentation', icon: BookOpen },
];

interface AppLayoutProps {
  activePage: NavPageId;
  onNavigate: (page: NavPageId) => void;
  modelTrained: boolean;
  modelVersion: string | null;
  backendHealthy: boolean;
  children: ReactNode;
}

function BrandLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 border border-teal-400/30">
        <svg viewBox="0 0 28 28" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M2 14H6.5L9.2 6.5L13 21.5L16.5 9.5L19.4 17L21.5 14H26"
            stroke="#2dd4bf"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold tracking-tight text-white">
            EMG INTELLIGENCE
          </p>
          <p className="truncate text-[11px] text-slate-400">Biomedical Action Recognition</p>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({
  activePage,
  onNavigate,
  modelTrained,
  modelVersion,
  backendHealthy,
  children,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0];

  const handleNavClick = (id: NavPageId) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const renderNavList = (isCollapsed: boolean) => (
    <nav className="flex-1 space-y-1 px-2.5 py-4" aria-label="Primary Navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === activePage;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavClick(item.id)}
            title={isCollapsed ? item.label : undefined}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              active
                ? 'bg-teal-500/15 text-teal-200'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${
                active ? 'text-teal-300' : 'text-slate-400 group-hover:text-slate-200'
              }`}
            />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Persistent Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:shrink-0 bg-[#0F2544] text-white border-r border-slate-800/80 transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <BrandLogo collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {renderNavList(collapsed)}

        {/* Quiet model status summary inside sidebar footer */}
        {!collapsed && (
          <div className="border-t border-white/10 p-4 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Cpu className="h-3.5 w-3.5 text-teal-300 shrink-0" />
              <span className="font-medium text-white">Classifier State</span>
            </div>
            <p className="mt-1.5 text-slate-300">
              {modelTrained ? `Trained · ${modelVersion ?? 'Active'}` : 'Model not trained'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {backendHealthy ? 'API connected' : 'Backend unreachable'}
            </p>
          </div>
        )}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 flex w-68 max-w-[82vw] flex-col bg-[#0F2544] text-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <BrandLogo collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavList(false)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Breadcrumb Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="hidden sm:inline text-slate-500 transition-colors hover:text-slate-900 whitespace-nowrap shrink-0"
              >
                EMG Intelligence
              </button>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="hidden md:inline text-slate-500 whitespace-nowrap shrink-0">
                {currentNav.section}
              </span>
              <span className="hidden md:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="truncate font-semibold text-slate-900">{currentNav.label}</span>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('analysis')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F2544] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#173661] whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload EMG CSV
            </button>
          </div>
        </header>

        {/* Backend offline error banner if unreachable */}
        {!backendHealthy && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">
            Backend API is currently unavailable. Please verify that the server is running and refresh the page.
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
