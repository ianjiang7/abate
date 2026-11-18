import { Suspense } from "react";
import RootDocument from "@/components/root-document";
import { GoogleAds } from "@/components/google-ads";
export { metadata, viewport } from "@/components/root-document";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument publicPage>{children}<Suspense fallback={null}><GoogleAds /></Suspense></RootDocument>;
}
