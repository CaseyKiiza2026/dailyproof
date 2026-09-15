import type { Metadata } from "next";
import "./globals.css";
import { UserClockProvider } from "@/components/layout/user-clock";

export const metadata: Metadata = {
  title: "DailyProof",
  description: "Turn consistency into visible proof.",
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <UserClockProvider>{children}</UserClockProvider>
      </body>
    </html>
  );
}
