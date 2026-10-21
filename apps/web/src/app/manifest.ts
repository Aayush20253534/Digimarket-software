import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AmplifyWorld Workspace",
    short_name: "AmplifyWorld",
    description: "Private agency operations: tasks, clients, projects, leads, finance and approvals.",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0B0713",
    theme_color: "#10091C",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
