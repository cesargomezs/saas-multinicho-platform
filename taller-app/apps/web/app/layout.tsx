import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TallerApp - Control de Vehículos',
  description: 'Sistema de gestión para taller mecánico y latonería',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}