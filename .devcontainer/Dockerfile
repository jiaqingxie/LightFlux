ARG NODE_VERSION=22-bookworm
FROM node:${NODE_VERSION}

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        openssh-client \
        postgresql-client \
        ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p \
        /workspaces/LightFlux/lightflux/node_modules \
        /workspaces/LightFlux/server/node_modules \
        /workspaces/LightFlux/cli/node_modules \
        /home/node/.npm \
    && chown -R node:node /workspaces /home/node/.npm

ENV NPM_CONFIG_CACHE=/home/node/.npm

USER node

CMD ["sleep", "infinity"]
