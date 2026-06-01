export function PortChecklist({ text }: { text: string }) {
  return <pre className="mini-output">{text || "Run port checks to see listener status."}</pre>;
}
