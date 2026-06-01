import { Server } from "lucide-react";

export function ServiceHealthCard({ name, status }: { name: string; status: string }) {
  return (
    <article className="service-card">
      <Server size={18} />
      <div>
        <strong>{name}</strong>
        <span>{status}</span>
      </div>
    </article>
  );
}
