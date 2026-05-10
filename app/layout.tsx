import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WatchWith — Watch movies together',
  description: 'P2P watch party with screen sharing, audio ducking, and synced playback.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-zinc-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
