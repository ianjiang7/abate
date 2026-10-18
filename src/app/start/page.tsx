import type { Metadata } from "next";
import { StartForm } from "@/components/start/start-form";

export const metadata: Metadata = {
  title: "Start your case",
  description: "Tell Abate what needs fixing. About 5 minutes, no account.",
};

export default function StartPage() {
  return <StartForm />;
}
