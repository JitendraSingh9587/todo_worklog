import { NavLink } from "react-router-dom";
import ThemeToggle from "../common/ThemeToggle.jsx";

export default function TopBar({ center, actions }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <nav className="site-nav site-nav--inline" aria-label="Main">
          <div className="site-nav-links">
            <NavLink to="/" end>
              Calendar
            </NavLink>
            <span className="site-nav-sep" aria-hidden="true">
              /
            </span>
            <NavLink to="/report">Report</NavLink>
          </div>
        </nav>
      </div>
      <div className="topbar-center">{center}</div>
      <div className="topbar-actions">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
