import type { Metadata, Viewport } from "next";
import AppFrame from "@/components/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: "JONGLOEI · Event Tickets · บัตรเข้าร่วมงานอีเวนต์",
  description: "ซื้อ ขายต่อ และจัดเก็บบัตรเข้าร่วมงานอีเวนต์อย่างปลอดภัยและไร้การปลอมแปลง สามารถชำระเงินผ่าน PromptPay ยินดีคืนเงินหากมีการยกเลิกงาน | Buy, resell and keep event tickets that cannot be forged. Pay with PromptPay, with automatic refunds if an event is cancelled.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#120D0E" };

// dark is the default; a saved light theme is applied before paint so the page does not flash
const THEME = `try{if(localStorage.getItem('jongloei-theme')==='light')document.documentElement.dataset.theme='light'}catch(_){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600&family=Prompt:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap" />
      </head>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
