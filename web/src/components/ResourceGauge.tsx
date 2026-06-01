export function ResourceGauge({ label, value }: { label: string; value: string }) {
  return (
    <div className="gauge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
