#!/bin/bash
# ============================================
# PRODUCTION VM - FILE PERMISSIONS SETUP
# Fixes: Cannot move/copy folders to /opt/
# ============================================

echo ""
echo "========================================"
echo "  PRODUCTION PERMISSIONS SETUP"
echo "========================================"
echo ""
echo "This script will:"
echo "  1. Create all required directories in /opt/"
echo "  2. Set proper ownership and permissions"
echo "  3. Allow Docker to read/write files"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ ERROR: This script must be run as root"
    echo "Please run: sudo bash setup-production-permissions.sh"
    exit 1
fi

echo "✅ Running as root - proceeding with setup..."
echo ""

# Get the user who will run docker (usually the non-root user who invoked sudo)
DOCKER_USER=${SUDO_USER:-$USER}
echo "📋 Docker user: $DOCKER_USER"
echo ""

# Create all required directories
echo "[Step 1/4] Creating directories in /opt/..."
mkdir -p /opt/certificates/templates
mkdir -p /opt/certificates/generated
mkdir -p /opt/requirements
mkdir -p /opt/organizations
mkdir -p /opt/applications
mkdir -p /opt/events
mkdir -p /opt/esignatures
mkdir -p /opt/approval-signatures
mkdir -p /opt/templates
echo "✅ Directories created"
echo ""

# Set ownership to docker user and docker group
echo "[Step 2/4] Setting ownership..."
chown -R $DOCKER_USER:$DOCKER_USER /opt/certificates
chown -R $DOCKER_USER:$DOCKER_USER /opt/requirements
chown -R $DOCKER_USER:$DOCKER_USER /opt/organizations
chown -R $DOCKER_USER:$DOCKER_USER /opt/applications
chown -R $DOCKER_USER:$DOCKER_USER /opt/events
chown -R $DOCKER_USER:$DOCKER_USER /opt/esignatures
chown -R $DOCKER_USER:$DOCKER_USER /opt/approval-signatures
chown -R $DOCKER_USER:$DOCKER_USER /opt/templates
echo "✅ Ownership set to $DOCKER_USER:$DOCKER_USER"
echo ""

# Set permissions: 755 for read-only directories (rwxr-xr-x)
# This allows:
#   - Owner (docker user): read, write, execute
#   - Group: read, execute
#   - Others: read, execute
echo "[Step 3/4] Setting directory permissions..."
chmod -R 755 /opt/certificates
echo "✅ Certificate directory set to 755 (read-only)"
echo ""

# For uploaded files, we want world-writable directories
# Using -R flag to apply permissions to ALL NESTED SUBFOLDERS
# This fixes nested structures like organizations/1/1/logo/, organizations/2/2/logo/, etc.
echo "[Step 4/4] Setting special permissions for upload directories (INCLUDING ALL SUBFOLDERS)..."
# Make upload directories world-writable so Docker can write files
chmod -R 777 /opt/requirements
chmod -R 777 /opt/organizations
chmod -R 777 /opt/applications
chmod -R 777 /opt/events
chmod -R 777 /opt/esignatures
chmod -R 777 /opt/approval-signatures
chmod -R 777 /opt/templates
echo "✅ Upload directories and ALL SUBFOLDERS set to 777 (full access)"
echo ""

# Verify permissions
echo "========================================"
echo "  VERIFICATION"
echo "========================================"
echo ""
echo "Listing /opt/ directories:"
ls -la /opt/ | grep -E "certificates|requirements|organizations|applications|events|esignatures|approval-signatures|templates"
echo ""

echo "========================================"
echo "  SETUP COMPLETE!"
echo "========================================"
echo ""
echo "✅ All directories created"
echo "✅ Ownership set to: $DOCKER_USER:$DOCKER_USER"
echo "✅ Permissions configured"
echo ""
echo "You can now:"
echo "  1. Copy folders to /opt/ locations"
echo "  2. Run docker-compose up"
echo ""
echo "To copy existing files:"
echo "  sudo cp -r /path/to/requirements/* /opt/requirements/"
echo "  sudo cp -r /path/to/organizations/* /opt/organizations/"
echo ""
echo "To verify Docker can access:"
echo "  docker-compose up -d"
echo "  docker exec nginx ls -la /usr/share/nginx/html/requirements"
echo "  docker exec node-app ls -la /app/requirements"
echo ""
