"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, BrainCircuit, CalendarDays, ChevronDown,
  Command, FlaskConical, LayoutDashboard, MessageCircle, Network, PenTool, ScanSearch, ShieldCheck, Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/onboard", label: "Onboard", icon: ScanSearch },
  { href: "/brand", label: "Brand", icon: BrainCircuit },
  { href: "/cmo", label: "CMO", icon: MessageCircle },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/campaigns", label: "Campaigns", icon: ShieldCheck },
  { href: "/studio/launch", label: "Studio", icon: PenTool },
  { href: "/proof", label: "Proof", icon: FlaskConical },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/network", label: "Network", icon: Network },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.split("/[", 1)[0]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [workspaceName, setWorkspaceName] = useState("Northwind Labs");
  const current = nav.find((item) => isActive(pathname, item.href))?.label ?? "Workspace";

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cmo")
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled && body?.brand?.name) setWorkspaceName(body.brand.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark"><Command size={18} strokeWidth={2.5} /></span>
          <span><div className="brand-name">Northwind</div><div className="brand-kicker">CMO intelligence</div></span>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${isActive(pathname, href) ? "active" : ""}`}>
              <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="usage-card">
          <div className="usage-top"><span>AI spend this week</span><Activity size={12} /></div>
          <div className="usage-cost">$3.42</div>
          <div className="usage-bar"><span /></div>
          <div className="usage-top" style={{ marginTop: 7 }}><span>18% of $20 limit</span><span>Live</span></div>
        </div>
        <div className="sidebar-profile">
          <div className="avatar">AK</div>
          <div className="profile-meta"><div className="profile-name">Alex Kim</div><div className="profile-role">Marketing lead</div></div>
          <ChevronDown size={13} color="#84928f" />
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" style={{ width: 28, height: 28, borderRadius: 8 }}><Command size={14} /></span>Northwind</div>
          <div className="crumb"><span>{workspaceName}</span><span>/</span><strong>{current}</strong></div>
          <div className="top-actions">
            <div className="agent-pill"><span className="status-dot" /> 4 agents online</div>
            <button className="button button-primary"><Sparkles size={13} /> New campaign</button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
