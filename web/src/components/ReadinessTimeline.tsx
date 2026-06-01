export function ReadinessTimeline({ text }: { text: string }) {
  return <pre className="mini-output">{text || "Readiness has not been checked yet."}</pre>;
}
