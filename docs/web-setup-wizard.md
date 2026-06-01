# Web Setup Wizard

The setup wizard guides a first-time server owner through:

- Welcome and requirements
- Host checks
- Docker setup guidance
- Runtime location validation
- Server identity
- Funcom token storage
- Ports and firewall review
- Review
- Init/start task
- Finish/status

The wizard writes `.env` and `runtime/secrets/funcom-token.txt`, then calls the existing `dune init` flow as a tracked background task.

Host-level bootstrap is disabled by default. Automated Docker installation is intentionally not implemented in Phase 1. If it is added later, it must require `ALLOW_HOST_BOOTSTRAP=true`, show every command, and require explicit confirmation.

