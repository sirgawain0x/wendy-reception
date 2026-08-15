export const metadata = {
  title: 'Wendy Reception — AI Receptionist Platform',
  description: 'Agentic AI receptionist for dental and chiropractic practices',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}