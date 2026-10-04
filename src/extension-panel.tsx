import DeleteConfirmationDialog from "./components/ui/DeleteConfirmationDialog";
import UpgradeDialog from "./components/auth/UpgradeDialog";
import React from "react";
import ReactDOM from "react-dom/client";
import SidePanel from "./components/sidepanel/SidePanel";
import "./index.css";
import "./styles/components.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UpgradeDialog />
    <DeleteConfirmationDialog />
    <SidePanel />
  </React.StrictMode>
);

// Only presentation state crosses into the host page; account data stays in
// this extension-origin frame. The content script verifies source and origin.
if (window.parent !== window) {
  const announce = () => window.parent.postMessage({
    type: "persona:panel-ready", theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  }, "*");
  announce();
  new MutationObserver(announce).observe(document.documentElement, {attributes:true,attributeFilter:["data-theme"]});
}
