"use client";

import { useEffect } from "react";
import App from "../../../src/App";

export default function TeamPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", "/app");
  }, []);
  return <App initialPath="/app" />;
}
