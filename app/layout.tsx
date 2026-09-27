import type { Metadata, Viewport } from "next";
import "./globals.css";
import { UserClockProvider } from "@/components/layout/user-clock";
import { readPreferencesSeed } from "@/lib/preferences-seed";

export const metadata: Metadata = {
  title: "DailyProof",
  description: "Turn consistency into visible proof.",
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seed = await readPreferencesSeed();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem('dailyproof.theme')==='light'?'light':'dark'}catch{}` }} />
        <UserClockProvider seed={seed}>{children}</UserClockProvider>
      </body>
    </html>
  );
}
