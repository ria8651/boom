FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
RUN npm ci --omit=dev
# /out is where egress writes MP4s; the compose file mounts the host's
# recordings directory here.
ENV BOOM_RECORDINGS_DIR=/out
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
