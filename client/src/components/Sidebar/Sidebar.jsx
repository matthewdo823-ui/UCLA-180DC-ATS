import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { css } from "../../theme/colors";
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

const menuLinks = [
  { path: "/", label: "Home", icon: homeIcon },
  { path: "/grading", label: "Grading", icon: gradingIcon },
  { path: "/scoreboard", label: "Scoreboard", icon: scoreboardIcon },
];

const adminLinks = [
  { path: "/grader-scoreboard", label: "Graders", icon: gradersIcon },
  { path: "/cycle-management", label: "Cycles", icon: cyclesIcon },
  { path: "/flagged-candidates", label: "Flags", icon: flagsIcon },
  { path: "/user-management", label: "Team", icon: usersIcon },
];

function isLinkActive(pathname, path) {
  if (path === "/grading") {
    return ["/grading", "/resume-screener", "/interviews"].includes(pathname);
  }
  return pathname === path;
}

function NavLink({ link, active, onNavigate }) {
  return (
    <div
      onClick={() => onNavigate(link.path)}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.background = "#F3F4F6";
      }}
      onMouseOut={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? css.greenDark : "transparent",
        color: active ? "#FFF" : css.textGray,
        transition: "all 0.15s ease",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
      }}
    >
      {link.icon}
      {link.label}
    </div>
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
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = isAdminRole(user?.role);

  return (
    <div style={{
      width: 240,
      height: "100%",
      background: "#FFF",
      borderRight: `1px solid ${css.borderLight}`,
      display: "flex",
      flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ padding: "24px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${css.borderLight}` }}>
        <div style={{ width: 32, height: 32, background: css.greenDark, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: css.textDark, letterSpacing: "-0.02em" }}>
          180DC ATS
        </div>
      </div>

      <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24 }}>
        <NavSection
          title="Menu"
          links={menuLinks}
          pathname={location.pathname}
          onNavigate={navigate}
        />

        {isAdmin && (
          <NavSection
            title="Admin"
            links={adminLinks}
            pathname={location.pathname}
            onNavigate={navigate}
          />
        )}
      </div>

      <div style={{ marginTop: "auto", padding: 16, borderTop: `1px solid ${css.borderLight}`, display: "flex", flexDirection: "column", gap: 10 }}>
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
            background: "#FFF",
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
  );
}
