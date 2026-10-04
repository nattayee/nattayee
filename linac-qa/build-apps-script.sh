#!/bin/sh
# Copy the form into the Apps Script bundle. Run after every change to linac-qa/index.html.
set -e
cd "$(dirname "$0")"
cp index.html apps-script/Index.html
echo "apps-script/Index.html updated"
