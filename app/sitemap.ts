import type { MetadataRoute } from "next";

const SITE = "https://darke.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    "",
    "/pricing",
    "/login",
    "/signup",
    "/join",
    "/manual",
  ].map((path) => ({
    url: `${SITE}${path || "/"}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
