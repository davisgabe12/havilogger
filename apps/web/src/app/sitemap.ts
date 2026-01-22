import type { MetadataRoute } from "next";

const baseUrl = "https://havi.ai";

const routes = [
  "",
  "/pricing",
  "/solutions",
  "/solutions/fast-tracking",
  "/solutions/insights",
  "/solutions/reminders",
  "/solutions/chat-and-voice",
  "/solutions/personal",
  "/stories",
  "/resources",
  "/resources/blog",
  "/partners",
  "/about",
  "/competitors",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
