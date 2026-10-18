import { Camera } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type { PhotoRecord } from "@/lib/cases/types";

export function PhotosCard({ photos }: { photos: PhotoRecord[] }) {
  const visible = photos.filter((p) => p.url);
  if (visible.length === 0) return null;
  return (
    <Card>
      <CardHeader icon={<Camera className="size-5" />} title="Photos" subtitle="Private to this case" />
      <div className="grid grid-cols-3 gap-2.5">
        {visible.map((p) => (
          <a key={p.id} href={p.url!} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-2xl bg-lavender ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs from private storage */}
            <img src={p.url!} alt="Photo of the problem" className="size-full object-cover transition hover:scale-105" loading="lazy" />
          </a>
        ))}
      </div>
    </Card>
  );
}
