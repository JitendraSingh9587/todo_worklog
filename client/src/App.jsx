import { Navigate, Route, Routes } from "react-router-dom";
import CalendarPage from "./pages/CalendarPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CalendarPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
