import { createRoot } from "react-dom/client";
import InterviewPrep from "./src/InterviewPrep.jsx";
import "./src/styles.css";
const apps = [
  { id: 1, company: "Monzo", role: "Data Engineer", status: "Interview", interviewStage: "2nd Interview" },
  { id: 2, company: "Deliveroo", role: "Analytics Engineer", status: "Interview", interviewStage: "Home Assignment" },
];
createRoot(document.getElementById("root")).render(
  <div className="tracker-shell"><div className="tracker-main"><InterviewPrep apps={apps} /></div></div>
);
