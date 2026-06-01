export function PlayerProfileDrawer({ player }: { player: string | null }) {
  return <aside className="drawer">{player ? <pre>{player}</pre> : "Select a player to inspect profile details."}</aside>;
}
