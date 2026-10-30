import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const display = Anton({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: "Read the Room: make every reference land",
  description:
    "An agent that rewrites speeches, stand-up, ads and pitches so their cultural references land with a specific audience, grounded in Qloo's taste graph.",
  openGraph: {
    title: "Read the Room",
    description: "Every joke, ad and speech is written for a room the writer has never been in.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
