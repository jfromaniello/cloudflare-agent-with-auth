import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { Providers } from "@/providers";
import { BrowserRouter as Router, Routes, Route } from "react-router";
import Home from "./home";
const root = createRoot(document.getElementById("app")!);

root.render(
  <Providers>
    <Router>
      <Routes>
        <Route path="/" element= {
          <div className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100">
            <Home />
          </div>
        }>
        </Route>
        <Route path="/c/:threadID" element= {
          <div className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100">
            <App />
          </div>
          }>
        </Route>
      </Routes>
    </Router>
  </Providers>
);
