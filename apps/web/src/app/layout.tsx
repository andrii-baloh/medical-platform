import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "MediCare", description: "Платформа медицинских онлайн-консультаций" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f8fc" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}</body></html>; }
