import "./globals.css";
import Link from "next/link";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import HeaderActions from "@/components/HeaderActions";

export const metadata = {
  title: "Cadastral Field Book",
  description:
    "Digital field book for RTK GPS cadastral surveys — calibration & double-polar workflow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                  <path d="m2 17 10 5 10-5" />
                  <path d="m2 12 10 5 10-5" />
                </svg>
              </span>
              <div className="leading-tight">
                <div className="text-sm font-bold text-slate-900">Cadastral Field Book</div>
                <div className="text-[11px] text-slate-500">RTK GPS · Double-Polar Surveys</div>
              </div>
            </Link>
            <HeaderActions />
          </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
