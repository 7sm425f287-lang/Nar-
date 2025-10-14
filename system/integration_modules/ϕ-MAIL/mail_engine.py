from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import yaml
import os

class MailEngine:
    def __init__(self):
        self.config_path = os.path.join("integration_modules", "ϕ-MAIL", "config.yaml")
        with open(self.config_path, "r") as f:
            self.config = yaml.safe_load(f)
        self.creds = Credentials.from_authorized_user_file(
            os.path.join("keys", "SARIT-EL.json"),
            self.config["scopes"]
        )
        self.service = build("gmail", "v1", credentials=self.creds)

    def fetch_emails(self, max_results=5):
        try:
            results = self.service.users().messages().list(userId="me", maxResults=max_results).execute()
            emails = results.get("messages", [])
            return [
                {
                    "id": email["id"],
                    "snippet": self.service.users().messages()
                        .get(userId="me", id=email["id"])
                        .execute()["snippet"]
                }
                for email in emails
            ]
        except Exception as e:
            return {"error": f"Failed to fetch emails: {str(e)}"}
