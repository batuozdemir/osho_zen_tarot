#!/bin/sh
# Deploys the site and the journal server to vps-oci-1, tailnet only.
# Safe to run again: it only updates what changed and never touches the journal database.
#
#   server/deploy.sh            # from the repo root
#
# Root work goes through the host's `ubuntu` account, the same path as `transcribe`
# (batu's sudo there is password-gated by design).
set -eu

HOST="${TAROT_DEPLOY_HOST:-ubuntu@vps-oci-1}"
cd "$(dirname "$0")/.."

# The archive is built locally first: in a pipeline, plain sh would not notice tar failing
# halfway (a missing file) and would deploy whatever part of the site got through.
ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/tarot-deploy.XXXXXX")"
trap 'rm -f "$ARCHIVE"' EXIT
# --no-xattrs: macOS tags files with provenance attributes GNU tar on the host warns about.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE" \
  index.html styles.css script.js sw.js manifest.webmanifest js \
  assets/CardPictures assets/CardText assets/CardCommentary assets/UserGuide \
  assets/icons assets/sounds assets/EBGaramond.ttf assets/favicon.ico \
  server/app.py server/tarot.service
ssh "$HOST" 'cat > /tmp/tarot-deploy.tgz' < "$ARCHIVE"

ssh "$HOST" 'set -eu
  id tarot >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin tarot
  rm -rf /tmp/tarot-deploy && mkdir /tmp/tarot-deploy && tar -xzf /tmp/tarot-deploy.tgz -C /tmp/tarot-deploy
  sudo mkdir -p /opt/tarot
  sudo rm -rf /opt/tarot/site.new
  sudo mkdir /opt/tarot/site.new
  cd /tmp/tarot-deploy
  sudo cp -r index.html styles.css script.js sw.js manifest.webmanifest js assets /opt/tarot/site.new/
  sudo chown -R root:root /opt/tarot/site.new
  sudo chmod -R u=rwX,go=rX /opt/tarot/site.new
  [ -d /opt/tarot/site ] && sudo mv /opt/tarot/site /opt/tarot/site.old
  sudo mv /opt/tarot/site.new /opt/tarot/site
  sudo rm -rf /opt/tarot/site.old
  sudo install -o root -g root -m 0644 server/app.py /opt/tarot/app.py
  [ -x /opt/tarot/venv/bin/uvicorn ] || {
    sudo python3 -m venv /opt/tarot/venv
    sudo /opt/tarot/venv/bin/pip install --quiet "fastapi>=0.115" "uvicorn>=0.34"
  }
  sudo install -o root -g root -m 0644 server/tarot.service /etc/systemd/system/tarot.service
  sudo systemctl daemon-reload
  sudo systemctl enable --quiet tarot
  sudo systemctl restart tarot
  sudo tailscale serve --bg --set-path /tarot 8081 >/dev/null
  rm -rf /tmp/tarot-deploy /tmp/tarot-deploy.tgz
  sleep 2
  curl -fsS http://127.0.0.1:8081/api/health && echo
'
