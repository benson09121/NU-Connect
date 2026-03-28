#!/bin/sh

echo "🔍 [INIT] Checking template files..."

# Check if templates directory is empty (volume mount might have overridden it)
TEMPLATE_FILE="/app/templates/NUD-ACS-SDA-F-003 - Student Org Application Form.docx"
BACKUP_FILE="/app/templates-backup/NUD-ACS-SDA-F-003 - Student Org Application Form.docx"

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "⚠️  [INIT] Template file not found in /app/templates/"
    
    if [ -f "$BACKUP_FILE" ]; then
        echo "📋 [INIT] Copying template from backup location..."
        mkdir -p /app/templates
        cp "$BACKUP_FILE" "$TEMPLATE_FILE"
        chmod 644 "$TEMPLATE_FILE"
        echo "✅ [INIT] Template file restored from backup"
    else
        echo "❌ [INIT] ERROR: Template file not found in backup either!"
        echo "❌ [INIT] Please ensure template file exists in project"
        exit 1
    fi
else
    echo "✅ [INIT] Template file already exists in /app/templates/"
fi

# List template files for verification
echo "📂 [INIT] Template files:"
ls -lah /app/templates/

echo "🚀 [INIT] Starting application..."
