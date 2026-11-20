from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import CORS_ORIGINS
from app.database.sqlite_store import init_db

init_db()

app = FastAPI(
    title="EMG INTELLIGENCE API",
    description="Biomedical Surface Electromyography Signal Processing & ML Human Movement Recognition API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
