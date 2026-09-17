import type { Metadata } from "next";
import "./globals.css";
import { UserClockProvider } from "@/components/layout/user-clock";
import { readPreferencesSeed } from "@/lib/preferences-seed";

export const metadata: Metadata = {
  title: "DailyProof",
  description: "Turn consistency into visible proof.",
  icons: { apple: "/apple-touch-icon.png" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seed = await readPreferencesSeed();
  return (
    <html lang="en">
      <body>
        <UserClockProvider seed={seed}>{children}</UserClockProvider>
      </body>
    </html>
  );
}
