FROM node:22-alpine

WORKDIR /shared
COPY shared/package.json shared/package-lock.json ./
RUN npm ci --omit=dev
COPY shared/workspace.mjs ./

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/migrations ./migrations
COPY server/src ./src

RUN mkdir -p /app/data/uploads && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 8787

USER node

CMD ["sh", "-c", "npm run db:migrate && npm start"]
