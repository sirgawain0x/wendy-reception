export const metadata = {
  title: 'Dr Fort Vercel',
  description: 'Dr Fort Vercel deployment',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
