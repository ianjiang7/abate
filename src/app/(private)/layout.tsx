import RootDocument from "@/components/root-document";
export { metadata, viewport } from "@/components/root-document";

// Separate roots force a document reload: public tracking cannot survive into a private page.
export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}
