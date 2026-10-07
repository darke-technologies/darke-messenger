"use client";

import { useEffect, useState } from "react";
import App from "../src/App";
import { NewsfeedStandalone } from "../src/NewsfeedWindow";

export default function HomePage() {
  const [mode, setMode] = useState<"app" | "newsfeed">("app");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("newsfeed") === "1" || window.location.hash === "#newsfeed") {
      setMode("newsfeed");
    }
  }, []);

  if (mode === "newsfeed") return <NewsfeedStandalone />;
  return <App initialPath="/" />;
}
