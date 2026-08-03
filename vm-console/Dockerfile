# syntax=docker/dockerfile:1

# ---- build --------- original 22-alpine --------------------------------------
FROM node:lts-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# The shadcn-svelte primitives are generated into the repo, not vendored here.
# Fail loudly at build time rather than with an opaque import error.
RUN test -d src/lib/components/ui/button || { \
	echo ''; \
	echo 'ERROR: src/lib/components/ui is missing.'; \
	echo 'Run this once on the host, then rebuild:'; \
	echo '  npx shadcn-svelte@latest add button input textarea popover select'; \
	echo ''; \
	exit 1; \
	}

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:lts-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
	&& npm cache clean --force

COPY --from=build /app/build ./build

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build"]
