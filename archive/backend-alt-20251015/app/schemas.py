from pydantic import BaseModel


class ChatIn(BaseModel):
    message: str
    system: str | None = None


class ChatOut(BaseModel):
    reply: str
    provider: str

