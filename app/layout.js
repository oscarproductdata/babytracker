"use client";
import { SessionProvider } from "next-auth/react";

export default function RootLayout({ children }) {
  return (
    <html lang="sv" style={{ background: 'var(--bg)' }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#f8f7f4" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#141412" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Babytracker" />
        <title>Babytracker</title>
        <style>{`
          :root {
            --bg: #f8f7f4;
            --bg2: #ffffff;
            --border: rgba(0,0,0,0.08);
            --border-hover: rgba(0,0,0,0.14);
            --text: #1a1916;
            --text-muted: #717171;
            --text-faint: #9e9b95;
            --press-bg: #efefec;
            --nav-bg: rgba(248, 247, 244, 0.75);

          }
          @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) {
              --bg: #141412;
              --bg2: #1e1e1b;
              --border: rgba(255,255,255,0.08);
              --border-hover: rgba(255,255,255,0.14);
              --text: #f0ede8;
              --text-muted: #a09d96;
              --text-faint: #6b6860;
              --press-bg: #2a2a26;
              --nav-bg: rgba(20, 20, 18, 0.4);
            }
          }
          [data-theme="dark"] {
            --bg: #141412;
            --bg2: #1e1e1b;
            --border: rgba(255,255,255,0.08);
            --border-hover: rgba(255,255,255,0.14);
            --text: #f0ede8;
            --text-muted: #a09d96;
            --text-faint: #6b6860;
            --press-bg: #2a2a26;
            --nav-bg: rgba(20, 20, 18, 0.4);
          }
          html, body {
            touch-action: pan-x pan-y;
          }
          .nav-btn {
            transition: color 0.2s ease;
          }
          .pressable:active {
            transform: scale(0.97);
            transition: transform 0.1s, background-color 0.1s;
            background-color: var(--press-bg) !important;
          }
          .pressable-scale:active {
            transform: scale(0.97);
            transition: transform 0.1s;
          }
          .nav-btn:active {
            transform: scale(0.85);
            opacity: 0.6;
            transition: transform 0.12s ease, opacity 0.12s ease;
          }
          button.pressable:active {
            transform: scale(0.97);
            opacity: 0.85;
            transition: transform 0.1s, opacity 0.1s;
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 0.65; }
            50% { transform: scale(1.35); opacity: 0.05; }
          }
          .breathe-ring {
            animation: breathe 4s ease-in-out infinite;
          }
          .fade-up {
            animation: fadeUp 0.4s ease-out forwards;
          }
          .fade-up-1 { animation-delay: 0.05s; opacity: 0; }
          .fade-up-2 { animation-delay: 0.1s; opacity: 0; }
          .fade-up-3 { animation-delay: 0.15s; opacity: 0; }
          .fade-up-4 { animation-delay: 0.2s; opacity: 0; }
          .fade-up-5 { animation-delay: 0.25s; opacity: 0; }

          .cat-tabs::-webkit-scrollbar { display: none; }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: 'var(--bg)' }} onTouchStart={e => { if (e.touches.length > 1) e.preventDefault(); }}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
