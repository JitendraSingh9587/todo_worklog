import StatusBar from "../common/StatusBar.jsx";
import TopBar from "./TopBar.jsx";

export default function AppShell({
  center,
  actions,
  status,
  statusKind,
  children,
  shell = true,
}) {
  return (
    <div className={shell ? "app app--shell" : "app"}>
      <TopBar center={center} actions={actions} />
      <StatusBar message={status} kind={statusKind} />
      {children}
    </div>
  );
}
