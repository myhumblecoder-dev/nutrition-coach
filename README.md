# Nutrition Coach

## Problem Statement

Personal diet and fitness coach: photo meal logging with vision, daily targets, cron check-ins

## Solution Statement

Personal diet and fitness coach: photo meal logging with vision, daily targets, cron check-ins

Built with Next.js (App Router, TypeScript), Tailwind, Prisma + PostgreSQL, and Zod.

## Getting Started

### Prerequisites

- Node.js + [pnpm](https://pnpm.io)
- [Docker](https://www.docker.com) (for the local Postgres)

### Run it locally

```bash
cp .env.example .env.local   # local secrets (gitignored); DATABASE_URL → compose Postgres
docker compose up -d     # start Postgres on localhost:5432
pnpm install
pnpm prisma db push      # apply the Prisma schema
pnpm dev                 # http://localhost:3000
```

Tear down the database with `docker compose down` (add `-v` to wipe its data).
