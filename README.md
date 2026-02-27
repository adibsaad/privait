# Privait

Privait is a self-hosted personal AI system that combines LLMs, vector memory, and RAG to create a private, extensible AI workspace.

## Dev

1. Install overmind, docker compose, pnpm, and direnv
1. Run `pnpm install` and `pnpm install-all`
1. Run `docker-compose up -d`
1. Copy `Procfile.example` to `Procfile`
1. Copy `.envrc.example` to `.envrc` and modify variables as needed
1. Run `direnv allow`
1. Run `./scripts/download-models.sh`
1. Run `pnpm db:create` and `pnpm db:drizzle:push`
1. Run `pnpm start` to start the servers
