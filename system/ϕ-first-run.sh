#!/bin/bash
echo "Installing Google API dependencies..."
source venv/bin/activate
pip3 install --upgrade google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client pyyaml
echo "Setup complete."
