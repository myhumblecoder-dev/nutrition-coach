# Production image for the Next.js app (docker-compose web + deployable).
FROM node:20-slim
# openssl: Prisma's query engine needs it; node:20-slim omits it.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
# deps first (postinstall = prisma generate, needs the schema present)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
# app source + production build
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
