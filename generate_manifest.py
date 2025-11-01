#!/usr/bin/env python3
import os
import json

# Root directory containing all your tool folders
WEB_FILES_DIR = 'web_files'

manifest = {}

for folder_name in os.listdir(WEB_FILES_DIR):
    folder_path = os.path.join(WEB_FILES_DIR, folder_name)
    if os.path.isdir(folder_path):
        # List all .html files in the folder
        html_files = [f for f in os.listdir(folder_path) if f.endswith('.html')]
        if html_files:
            manifest[folder_name] = html_files

# Write manifest.json in the web_files directory
manifest_path = os.path.join(WEB_FILES_DIR, 'manifest.json')
with open(manifest_path, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"Manifest generated at {manifest_path} with folders: {list(manifest.keys())}")
