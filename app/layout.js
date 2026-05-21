"use client";
import { SessionProvider } from "next-auth/react";

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#f8f7f4" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Babytracker" />
        <title>Babytracker</title>
        <style>{`
          html, body {
            touch-action: pan-x pan-y;
          }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0 }} onTouchStart={e => { if (e.touches.length > 1) e.preventDefault(); }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
