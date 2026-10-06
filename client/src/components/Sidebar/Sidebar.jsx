import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo180 from "@images/180logo.webp";
import { useAuth } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { isAdminRole } from "../../utils/auth";

const homeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

const gradingIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const scoreboardIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
);

const demographicsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
    <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
  </svg>
);

const gradersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const cyclesIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const interestIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 3.5 14.6 8.8 20.5 9.7 16.2 13.8 17.2 19.6 12 16.9 6.8 19.6 7.8 13.8 3.5 9.7 9.4 8.8 12 3.5"></polygon>
  </svg>
);

const flagsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
    <line x1="4" y1="22" x2="4" y2="15"></line>
  </svg>
);

const usersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const assignmentsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"></path>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
  </svg>
);

const baseMenuLinks = [
  { path: "/", label: "Home", icon: homeIcon },
  { path: "/grading", label: "Grading", icon: gradingIcon },
  { path: "/scoreboard", label: "Scoreboard", icon: scoreboardIcon },
  { path: "/demographics", label: "Demographics", icon: demographicsIcon },
];

const adminLinks = [
  { path: "/grader-scoreboard", label: "Graders", icon: gradersIcon },
  { path: "/assignments", label: "Assignments", icon: assignmentsIcon },
  { path: "/cycle-management", label: "Cycles", icon: cyclesIcon },
  { path: "/demonstrated-interest", label: "Interest", icon: interestIcon },
  { path: "/flagged-candidates", label: "Flag / Refer", icon: flagsIcon },
  { path: "/user-management", label: "Team", icon: usersIcon },
];

function isLinkActive(pathname, path) {
  if (path === "/grading") {
    return ["/grading", "/resume-screener", "/interviews"].includes(pathname);
  }
  if (path === "/scoreboard") {
    return pathname === "/scoreboard" || pathname.startsWith("/scoreboard/");
  }
  return pathname === path;
}

function NavLink({ link, active, onNavigate }) {
  return (
    <button type="button"
      onClick={() => onNavigate(link.path)}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.background = "var(--color-surface-muted)";
      }}
      onMouseOut={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
      style={{
        display: "flex",
        border: "none",
        textAlign: "left",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        minHeight: 44,
        borderRadius: 8,
        cursor: "pointer",
        background: active ? css.greenDark : "transparent",
        color: active ? "var(--color-on-primary)" : css.textGray,
        transition: "all 0.15s ease",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
      }}
    >
      {link.icon}
      {link.label}
    </button>
  );
}

function NavSection({ title, links, pathname, onNavigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: css.textGray,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        paddingLeft: 12,
        marginBottom: 4,
      }}>
        {title}
      </div>
      {links.map((link) => (
        <NavLink
          key={link.path}
          link={link}
          active={isLinkActive(pathname, link.path)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isAdmin = isAdminRole(user?.role);
  const themeActionLabel = theme === "dark"
    ? "Switch to light mode"
    : "Switch to dark mode";
  const menuLinks = baseMenuLinks.map((link) => (
    link.path === "/" && isAdmin
      ? { ...link, label: "Admin Home" }
      : link
  ));
  const navigateAndClose = (path) => {
    setMobileOpen(false);
    navigate(path);
  };

  return (
    <div className="app-sidebar" data-mobile-open={mobileOpen} style={{
      width: 240,
      flexShrink: 0,
      height: "100%",
      background: css.cardWhite,
      borderRight: `1px solid ${css.borderLight}`,
      display: "flex",
      flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div className="app-sidebar-brand" style={{ padding: "24px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${css.borderLight}`, flexShrink: 0 }}>
        <img
          src={logo180}
          alt="180 Degrees Consulting"
          style={{ width: 32, height: 32, objectFit: "contain", display: "block", borderRadius: 8 }}
        />
        <div style={{ fontSize: 16, fontWeight: 700, color: css.textDark, letterSpacing: "-0.02em" }}>
          180DC ATS
        </div>
        <button type="button" className="app-menu-toggle" aria-expanded={mobileOpen} aria-controls="app-navigation" onClick={() => setMobileOpen(open => !open)}>
          {mobileOpen ? "Close menu" : "Menu"}
        </button>
      </div>

      <div id="app-navigation" className="app-sidebar-content">
      <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24 }}>
        <NavSection
          title="Menu"
          links={menuLinks}
          pathname={location.pathname}
          onNavigate={navigateAndClose}
        />

        {isAdmin && (
          <NavSection
            title="Admin"
            links={adminLinks}
            pathname={location.pathname}
            onNavigate={navigateAndClose}
          />
        )}
      </div>

      <div style={{ marginTop: "auto" }}>
        <div style={{ padding: "12px 16px" }}>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeActionLabel}
            style={{
              border: `1px solid ${css.borderLight}`,
              background: "var(--color-surface-muted)",
              color: css.textDark,
              borderRadius: 7,
              padding: "8px 11px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
          >
            {themeActionLabel}
          </button>
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${css.borderLight}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: css.textDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email}
            </div>
            <div style={{ fontSize: 11, color: css.textGray, marginTop: 3, textTransform: "capitalize" }}>
              {user?.role}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            style={{
              border: `1px solid ${css.borderLight}`,
              background: css.cardWhite,
              color: css.textGray,
              borderRadius: 8,
              padding: "9px 10px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
