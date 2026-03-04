#!/usr/bin/env bash
# FlowMCP deployment — run as root on hive server
# Usage: sudo bash deploy/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== FlowMCP Deployment ==="
echo "Project: $PROJECT_DIR"

# 1. Build
echo ""
echo "--- Step 1: Build ---"
cd "$PROJECT_DIR"
npm run build
echo "Build complete."

# 2. Quick health check (pre-deploy)
echo ""
echo "--- Step 2: Verify build ---"
timeout 5 node dist/index.js --http &
SERVER_PID=$!
sleep 2
if curl -sf http://127.0.0.1:3100/health > /dev/null 2>&1; then
  echo "Health check passed."
else
  echo "WARNING: Health check failed. Continuing anyway (server may need more startup time)."
fi
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

# 3. Install systemd service
echo ""
echo "--- Step 3: Install systemd service ---"
cp "$SCRIPT_DIR/flowmcp.service" /etc/systemd/system/flowmcp.service
systemctl daemon-reload
systemctl enable flowmcp
echo "Service installed and enabled."

# 4. Generate auth token if not already set
if ! grep -q 'MCP_AUTH_TOKEN=' /etc/systemd/system/flowmcp.service || grep -q '<set-before-enabling>' /etc/systemd/system/flowmcp.service; then
  TOKEN=$(openssl rand -hex 32)
  echo ""
  echo "--- Step 4: Auth token ---"
  echo "Generated token: $TOKEN"
  echo ""
  echo "IMPORTANT: Add this to the service file:"
  echo "  sudo systemctl edit flowmcp"
  echo "  [Service]"
  echo "  Environment=MCP_AUTH_TOKEN=$TOKEN"
  echo ""
  echo "Then give this to users for their Claude Desktop config."
fi

# 5. Install Traefik config (if Traefik is available)
echo ""
echo "--- Step 5: Traefik config ---"
if [ -d /etc/traefik/dynamic ]; then
  cp "$SCRIPT_DIR/flowmcp-traefik.yml" /etc/traefik/dynamic/flowmcp.yml
  echo "Traefik config installed. Auto-reloads within seconds."
  echo "IMPORTANT: Create DNS record for mcp.superbeing.ai in Cloudflare first!"
else
  echo "Traefik not found at /etc/traefik/dynamic. Skipping."
  echo "FlowMCP will be available at http://127.0.0.1:3100/mcp (local only)."
fi

# 6. Start service
echo ""
echo "--- Step 6: Start FlowMCP ---"
systemctl start flowmcp
sleep 2

if systemctl is-active --quiet flowmcp; then
  echo "FlowMCP is RUNNING."
  curl -sf http://127.0.0.1:3100/health | python3 -m json.tool 2>/dev/null || curl -sf http://127.0.0.1:3100/health
else
  echo "FAILED to start. Check: journalctl -u flowmcp -n 50"
  exit 1
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Service: systemctl status flowmcp"
echo "Logs:    journalctl -u flowmcp -f"
echo "Health:  curl http://127.0.0.1:3100/health"
echo ""
echo "For Claude Desktop users, add to config:"
echo '{'
echo '  "mcpServers": {'
echo '    "flow-immersive": {'
echo '      "type": "http",'
echo '      "url": "https://mcp.superbeing.ai/mcp"'
echo '    }'
echo '  }'
echo '}'
