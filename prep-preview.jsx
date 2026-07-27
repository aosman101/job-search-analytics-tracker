import { createRoot } from "react-dom/client";
import JobTracker from "./src/JobTracker.jsx";
import "./src/styles.css";
const apps = [
  { id: 1, company: "Monzo", role: "Data Engineer", status: "Interview", interviewStage: "2nd Interview", dateApplied: "2026-07-10", location: "London", source: "LinkedIn" },
  { id: 2, company: "Deliveroo", role: "Analytics Engineer", status: "Interview", interviewStage: "Home Assignment", dateApplied: "2026-07-14", location: "London", source: "Referral" },
  { id: 3, company: "Wise", role: "Data Engineer", status: "Applied", dateApplied: "2026-07-22", location: "London", source: "Company site" },
  { id: 4, company: "Octopus", role: "Data Analyst", status: "Rejected", dateApplied: "2026-06-02", location: "Remote", source: "LinkedIn" },
  { id: 5, company: "Cleo", role: "Analytics Engineer", status: "Applied", dateApplied: "2026-06-20", location: "London", source: "Otta" },
];
createRoot(document.getElementById("root")).render(<JobTracker initialApps={apps} onLogout={() => {}} />);
