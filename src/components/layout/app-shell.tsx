"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, BrainCircuit, CalendarDays,
  MessageCircle, ScanSearch, Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { AGENT_COUNT } from "@/lib/agents/roster";

const nav = [
  { href: "/onboard", label: "Onboard", icon: ScanSearch },
  { href: "/brand", label: "Brand", icon: BrainCircuit },
  { href: "/cmo", label: "CMO", icon: MessageCircle },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/insights", label: "Insights", icon: BarChart3 },
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
          <span className="brand-mark">
            <Image src="/northwind.png" alt="" width={26} height={26} priority />
          </span>
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
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" style={{ width: 28, height: 28, borderRadius: 8 }}><Image src="/northwind.png" alt="" width={20} height={20} /></span>Northwind</div>
          <div className="crumb"><span>{workspaceName}</span><span>/</span><strong>{current}</strong></div>
          <div className="top-actions">
            <div className="agent-pill"><span className="status-dot" /> {AGENT_COUNT} agents online</div>
            <button className="button button-primary"><Sparkles size={13} /> New campaign</button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
