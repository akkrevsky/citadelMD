#!/bin/sh
set -e

mkdir -p "$DSH_HOME"

# Seed the home-level patch and the agent persona on first boot; later boots
# keep whatever lives in the volume.
if [ ! -f "$DSH_HOME/cordis.patch.yml" ]; then
  cp /opt/dsh-profile/cordis.patch.yml "$DSH_HOME/cordis.patch.yml"
  cp /opt/dsh-profile/AGENTS.md "$DSH_HOME/AGENTS.md"
  echo "[dsh] home seeded: $DSH_HOME/cordis.patch.yml, AGENTS.md"
fi

exec npx dsh web --no-open
