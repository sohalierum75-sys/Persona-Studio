import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Users, Film, Shirt, MapPin, Clock, Settings,
  ChevronLeft, Menu, Moon, Sun, Search,
} from "lucide-react";
import { useStudio } from "../../store";
import SyncStatus from "../auth/SyncStatus";
import AccountMenu from "../auth/AccountMenu";

interface Props { children: React.ReactNode; }

const NAV = [
  { to: "/characters", icon: Users,   label: "Characters" },
  { to: "/wardrobe",   icon: Shirt,   label: "Wardrobe"   },
  { to: "/locations",  icon: MapPin,  label: "Locations"  },
  { to: "/history",    icon: Clock,   label: "History"    },
  { to: "/settings",   icon: Settings,label: "Settings"   },
];

export default function StudioLayout({ children }: Props) {
  const { settings, saveSettings, characters, episodes } = useStudio();
  const [navOpen, setNavOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function toggleTheme() {
    saveSettings({ ...settings, theme: settings.theme === "dark" ? "light" : "dark" });
  }

  return (
    <div className="studio-layout">
      {/* Topbar */}
      <header className="topbar">
        <button
          className="btn btn-icon"
          onClick={() => setNavOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <Menu size={18} />
        </button>
        <a href="#/" className="topbar-logo">
          <img src="/logo.png" alt="" className="topbar-logo-icon" aria-hidden="true" />
          <span>Persona Studio</span>
        </a>
        <div className="topbar-spacer" />
        <div style={{ position: "relative" }}>
          <Search
            size={14}
            style={{
              position: "absolute", left: 10, top: "50%",
              transform: "translateY(-50%)", color: "var(--text-muted)",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 32, width: 220, height: 34 }}
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search"
          />
        </div>
        <button className="btn btn-icon" onClick={toggleTheme} aria-label="Toggle theme">
          {settings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <SyncStatus />
        <AccountMenu />
      </header>

      <div className="studio-body">
        {/* Left Nav */}
        {navOpen && (
          <nav className="studio-nav" aria-label="Main navigation">
            <div className="nav-section">
              <div className="nav-section-label">Workspace</div>
              {NAV.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>

            {/* Recent Characters */}
            {characters.length > 0 && (
              <div className="nav-section" style={{ borderTop: "1px solid var(--divider)" }}>
                <div className="nav-section-label">Characters</div>
                {characters.slice(0, 5).map((c) => (
                  <NavLink
                    key={c.id}
                    to={`/characters/${c.id}`}
                    className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                    style={{ fontSize: 12 }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: "linear-gradient(135deg, #A99BFF22, #7B6FE822)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "var(--accent)", flexShrink: 0,
                    }}>
                      {c.name[0]}
                    </div>
                    <span className="truncate">{c.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </nav>
        )}

        {/* Main content */}
        <main className="studio-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
