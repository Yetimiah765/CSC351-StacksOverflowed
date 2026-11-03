import './globals.css';
import NavBar from '../components/NavBar';
import NavigationTracker from '../components/NavigationTracker';

export const metadata = {
  title: 'SSU Starter App',
  description: 'Next.js + Tailwind + Supabase starter for students',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {/* SRS-108.7: remembers the pages visited, for the back buttons. */}
        <NavigationTracker />
        {children}
      </body>
    </html>
  );
}
