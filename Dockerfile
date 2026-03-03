FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/
COPY samples/ ./samples/

ENV MCP_HTTP_PORT=3100
ENV MCP_HTTP_HOST=0.0.0.0

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js", "--http"]
