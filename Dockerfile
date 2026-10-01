# syntax=docker/dockerfile:1

FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS client-deps
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY --from=client-deps /app/client/node_modules ./node_modules
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json backend/package-lock.json backend/nodemon.json ./backend/
COPY backend/src ./backend/src
COPY backend/data ./backend/data
COPY --from=client-build /app/client/dist ./client/dist
WORKDIR /app/backend
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/data ./data
COPY --from=client-build /app/client/dist /app/client/dist
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "start"]
