import { Bug, CircleHelp, DoorOpen, Droplets, ShowerHead, Sprout, ThermometerSnowflake, Zap, type LucideIcon } from "lucide-react";
import type { IssueTypeId } from "@/lib/domain/issues";

const ICONS: Record<IssueTypeId, LucideIcon> = {
  heat: ThermometerSnowflake,
  leak: Droplets,
  mold: Sprout,
  pests: Bug,
  window_door: DoorOpen,
  plumbing: ShowerHead,
  electrical: Zap,
  other: CircleHelp,
};

export function IssueIcon({ type, className }: { type: IssueTypeId; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className ?? "size-5"} aria-hidden="true" />;
}
