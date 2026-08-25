FROM node:22-alpine

WORKDIR /app

# dsh is a developer preview with compatibility-breaking changes: pin EXACT
# versions and re-check `npm view @deepseek-ai/dsh version` before bumping.
# mcp-client is not a dependency of dsh — it must be resolvable from
# node_modules for the profile patch's insert row to load it.
RUN npm init -y > /dev/null \
  && npm install --save-exact \
    @deepseek-ai/dsh@0.1.1-rc.2 \
    @deepseek-ai/dsh-mcp-client@0.0.1-rc.1

COPY profile/ /opt/dsh-profile/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DSH_HOME=/data/dsh
EXPOSE 3080

ENTRYPOINT ["/entrypoint.sh"]
