export function DangerConfirmDialog({ phrase }: { phrase: string }) {
  return <p className="danger-note">Dangerous actions require confirmation: <code>{phrase}</code></p>;
}
