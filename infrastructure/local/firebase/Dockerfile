FROM node:26-bookworm-slim
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY firebase.json start.mjs ./
ENV CI=true FIREBASE_CLI_DISABLE_TELEMETRY=true TMPDIR=/workspace/data/runtime
EXPOSE 9099 4000
CMD ["node", "start.mjs"]
