import type { Metadata } from "next";
import { headers } from "next/headers";
import { ToastProvider } from "@/components/common/toast";
import { me } from "@/lib/i18n/me";
import "./globals.css";

export const metadata: Metadata = {
  title: me.app.name,
  description: me.app.description,
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Doc 08 §9: request-time rendering lets Next apply the per-request CSP nonce.
  await headers();
  return (
    <html lang="sr-Latn-ME">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
