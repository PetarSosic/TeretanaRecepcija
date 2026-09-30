import type { MetadataRoute } from "next";
import { me } from "@/lib/i18n/me";

/**
 * D-91: the web app manifest, served at /manifest.webmanifest, lets Chrome and Edge on a
 * computer and Android, and Safari on iOS, install the app in its own window. There is
 * no service worker: the app stays online only (D-03, doc 08 §9).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: me.app.name,
    short_name: me.app.name,
    description: me.app.description,
    lang: "sr-Latn-ME",
    // The root sends each role to its own home screen (doc 06 §2).
    start_url: "/",
    scope: "/",
    display: "standalone",
    // --background, and the app header's white for the window's title bar.
    background_color: "#f5f5f0",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
