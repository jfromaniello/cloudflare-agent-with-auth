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
        <Route path="/" element={<Home />}></Route>
        <Route path="/c/:threadID" element={<App />}></Route>
      </Routes>
    </Router>
  </Providers>
);
