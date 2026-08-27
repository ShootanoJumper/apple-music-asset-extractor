import "./globals.css";

export const metadata = {
  title: "Apple Music Asset Extractor",
  description: "Inspect Apple Music video metadata, artwork, and public preview assets."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
