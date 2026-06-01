export function LogViewer({ text }: { text: string }) {
  return <pre className="log-box large">{text || "No logs loaded."}</pre>;
}
