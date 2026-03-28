FROM node:lts

 RUN apt-get update && apt-get install -y \
     libreoffice \
    fonts-croscore \
    fonts-liberation \
    fonts-dejavu \
    fontconfig \
    fonts-freefont-ttf \
    fonts-noto \
    fonts-roboto \
    # Playwright/Crawlee dependencies for Facebook scraping
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# NOTE: Playwright browsers will be installed after npm install
# This allows Crawlee to manage browser installations automatically

RUN apt-get install -y fontconfig
RUN fc-cache -f -v

ENV LIBREOFFICE_PROFILE=/tmp/libreoffice-profile
RUN mkdir -p $LIBREOFFICE_PROFILE && \
    chmod -R 777 $LIBREOFFICE_PROFILE


COPY fonts/fonts.conf /etc/fonts/fonts.conf
# RUN fc-cache -fv && mkdir -p /tmp/fonts-cache && chmod 777 /tmp/fonts-cache

RUN mkdir -p /app/certificates/templates /app/certificates/generated && \
    chown -R node:node /app/certificates

# Copy requirements folder with its contents
COPY requirements /app/requirements
RUN chown -R node:node /app/requirements

# Copy organizations folder with its contents
COPY organizations /app/organizations
RUN chown -R node:node /app/organizations

RUN mkdir -p /app/applications && \
    chown -R node:node /app/applications

RUN mkdir -p /app/esignatures && \
    chown -R node:node /app/esignatures

RUN mkdir -p /app/templates && \
    chown -R node:node /app/templates

WORKDIR /app
COPY package*.json ./

RUN ls -ld /app/certificates && \
    ls -l /app/certificates

RUN npm install

# Install Playwright browsers for Crawlee
RUN npx playwright install chromium
RUN npx playwright install-deps

# Copy application files
COPY . .

# Re-apply ownership after COPY (COPY resets ownership to root)
RUN chown -R node:node /app/esignatures /app/uploads /app/applications /app/templates /app/.auth /app/storage

USER node

# 📋 DOCUMENT GENERATION SETUP
# Copy templates to backup location (won't be overridden by volume mount)
RUN echo "📋 [BUILD] Setting up document generation templates..." && \
    mkdir -p /app/templates-backup && \
    if [ -d /app/templates ] && [ -f /app/templates/*.docx ]; then \
        echo "✅ [BUILD] Found template files, copying to backup..."; \
        cp -r /app/templates/* /app/templates-backup/ 2>/dev/null || true; \
        chown -R node:node /app/templates-backup; \
        chmod 755 /app/templates-backup; \
        chmod 644 /app/templates-backup/*.docx 2>/dev/null || true; \
        ls -lh /app/templates-backup/; \
    else \
        echo "⚠️  [BUILD] No template files found in /app/templates/"; \
    fi

# Copy and setup init script
COPY scripts/init-templates.sh /app/scripts/init-templates.sh
RUN dos2unix /app/scripts/init-templates.sh 2>/dev/null || sed -i 's/\r$//' /app/scripts/init-templates.sh && \
    chmod +x /app/scripts/init-templates.sh && \
    chown node:node /app/scripts/init-templates.sh && \
    echo "✅ [BUILD] Template initialization script ready"

# Set permissions for templates directory and verify template file exists
RUN if [ -d /app/templates ] && [ -f /app/templates/*.docx ]; then \
        echo "✅ Found templates folder with DOCX file, setting permissions..."; \
        chown -R node:node /app/templates; \
        chmod 755 /app/templates; \
        chmod 644 /app/templates/*.docx 2>/dev/null || true; \
        ls -lh /app/templates/; \
    else \
        echo "⚠️  No templates folder or DOCX file found, creating empty directory..."; \
        mkdir -p /app/templates; \
        chown -R node:node /app/templates; \
        chmod 755 /app/templates; \
    fi

# Set permissions for applications directory (for generated documents)
RUN mkdir -p /app/applications && \
    chown -R node:node /app/applications && \
    chmod 755 /app/applications && \
    echo "✅ Applications directory created for document generation"

# Ensure Facebook Scraper directories exist and copy auth files if present
RUN mkdir -p /app/.auth /app/storage/request_queues /app/storage/datasets /app/storage/key_value_stores

# Set proper permissions for Facebook Scraper directories
# The .auth folder and its contents should be copied via COPY . . above
RUN if [ -d /app/.auth ] && [ "$(ls -A /app/.auth)" ]; then \
        echo "✅ Found .auth folder with files, setting permissions..."; \
        chown -R node:node /app/.auth; \
        chmod 700 /app/.auth; \
        chmod 600 /app/.auth/*.json 2>/dev/null || true; \
    else \
        echo "ℹ️  No .auth folder found, creating empty directory..."; \
        mkdir -p /app/.auth; \
        chown -R node:node /app/.auth; \
        chmod 700 /app/.auth; \
    fi && \
    chown -R node:node /app/storage && \
    chmod -R 755 /app/storage

# Set Crawlee storage environment variable
ENV CRAWLEE_STORAGE_DIR=/app/storage

EXPOSE 3000

# Run init script if it exists, then start server
CMD ["/bin/sh", "-c", "if [ -x /app/scripts/init-templates.sh ]; then /app/scripts/init-templates.sh; fi && npm run dev"]

