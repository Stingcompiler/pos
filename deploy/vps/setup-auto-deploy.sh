#!/usr/bin/env bash
# يفعّل النشر الآلي لنسخة العرض مرة واحدة. يُشغَّل من جهازك في جذر المستودع:
#
#   bash deploy/vps/setup-auto-deploy.sh ~/.ssh/ovh_vps_ed25519
#
# 1. يولّد مفتاح نشر جديداً خاصاً بـ GitHub Actions
# 2. يثبّت /usr/local/bin/aspir-deploy (root) ويضيف المفتاح إلى authorized_keys
#    مقيّداً بهذا الأمر وحده (restrict,command=…): لا طرفية ولا أوامر أخرى
# 3. يضع المفتاح وبصمة الخادم في أسرار المستودع ويفعّل ASPIR_DEPLOY
# 4. يحذف نسخة المفتاح الخاص من جهازك — تبقى في GitHub فقط
set -euo pipefail

ADMIN_KEY="${1:?usage: setup-auto-deploy.sh <your admin ssh key>}"
HOST=57.129.162.57
REPO=Stingcompiler/pos
cd "$(git rev-parse --show-toplevel)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "github-actions-aspir-deploy" -f "$TMP/deploy"

echo "» installing the deploy command and restricted key on $HOST"
scp -q -i "$ADMIN_KEY" deploy/vps/aspir-deploy "ubuntu@$HOST:/tmp/aspir-deploy"
ssh -i "$ADMIN_KEY" "ubuntu@$HOST" "set -e
  sudo install -o root -g root -m 755 /tmp/aspir-deploy /usr/local/bin/aspir-deploy
  rm /tmp/aspir-deploy
  cp -a ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-\$(date -u +%Y%m%dT%H%M%SZ)
  sed -i '/github-actions-aspir-deploy/d' ~/.ssh/authorized_keys
  echo 'restrict,command=\"/usr/local/bin/aspir-deploy\" $(cat "$TMP/deploy.pub")' >> ~/.ssh/authorized_keys"

echo "» checking the key can only run the deploy command"
probe="$(ssh -i "$TMP/deploy" -o IdentitiesOnly=yes -o BatchMode=yes "ubuntu@$HOST" "whoami" 2>&1 || true)"
if grep -q "usage: aspir-deploy" <<<"$probe" && ! grep -qx "ubuntu" <<<"$probe"; then
  echo "  ok: arbitrary commands are refused"
else
  echo "  ✗ the key is not restricted — stopping. Output was:" >&2
  echo "$probe" >&2; exit 1
fi

echo "» saving GitHub secrets and enabling auto deploy"
gh secret set ASPIR_SSH_KEY --repo "$REPO" < "$TMP/deploy"
ssh-keyscan -t ed25519,ecdsa,rsa "$HOST" 2>/dev/null | gh secret set ASPIR_KNOWN_HOSTS --repo "$REPO"
gh variable set ASPIR_DEPLOY --repo "$REPO" --body true

echo "✓ done — every merge to main that passes CI now deploys to aspir.stingdev.pro"
