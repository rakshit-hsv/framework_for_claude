#!/bin/bash
#
# SOP Validate CLI Installer
# Installs sop-validate globally on your system
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rakshit-hsv/framework_for_claude/main/install.sh | bash
#
# Or locally:
#   ./install.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║       SOP Validate CLI Installer          ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo -e "${RED}Error: Node.js 16+ required. Found: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v) detected"

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm $(npm -v) detected"

# Determine install directory
INSTALL_DIR="$HOME/.sop-validate"

echo ""
echo -e "${YELLOW}Installing to: ${INSTALL_DIR}${NC}"
echo ""

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/rakshit-hsv/framework_for_claude.git "$INSTALL_DIR"
fi

# Navigate to validation directory
cd "$INSTALL_DIR/validation"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install --silent

# Build
echo "Building..."
npm run build --silent

# Link globally
echo "Linking CLI globally..."
npm link --silent

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Installation Complete!              ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo "Usage:"
echo ""
echo -e "  ${BLUE}sop-validate init${NC}        Copy SOP files to your project"
echo -e "  ${BLUE}sop-validate --staged${NC}   Validate staged changes"
echo -e "  ${BLUE}sop-validate --help${NC}     Show all commands"
echo ""
echo "Quick start:"
echo ""
echo "  cd your-project"
echo "  sop-validate init"
echo "  sop-validate --staged"
echo ""

# Verify installation
if command -v sop-validate &> /dev/null; then
    echo -e "${GREEN}✓${NC} sop-validate is ready to use"
else
    echo -e "${YELLOW}Note: You may need to restart your terminal or run:${NC}"
    echo "  source ~/.bashrc  # or ~/.zshrc"
fi
