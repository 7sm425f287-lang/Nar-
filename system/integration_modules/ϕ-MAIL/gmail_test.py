from mail_engine import MailEngine

if __name__ == "__main__":
    mail = MailEngine()
    emails = mail.fetch_emails(max_results=3)
    if "error" in emails:
        print(emails["error"])
    else:
        for email in emails:
            print(f"Email ID: {email['id']}, Snippet: {email['snippet']}")
