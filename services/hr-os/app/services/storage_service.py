from abc import ABC, abstractmethod
from dataclasses import dataclass

from vercel import blob

from app.core.config import get_settings


@dataclass
class DownloadedBlob:
    content: bytes
    content_type: str | None


class StorageService(ABC):
    @abstractmethod
    def upload(self, pathname: str, content: bytes, content_type: str) -> str:
        """Upload raw bytes and return the blob's access URL."""

    @abstractmethod
    def download(self, url: str) -> DownloadedBlob:
        """Fetch a previously uploaded blob's raw bytes."""


class StorageError(RuntimeError):
    pass


class VercelBlobStorage(StorageService):
    """Real Vercel Blob integration via the official `vercel` Python SDK."""

    def upload(self, pathname: str, content: bytes, content_type: str) -> str:
        settings = get_settings()
        if not settings.blob_read_write_token:
            raise StorageError(
                "BLOB_READ_WRITE_TOKEN is not configured — set it in backend/.env to enable uploads."
            )

        try:
            result = blob.put(
                pathname,
                content,
                access="private",
                content_type=content_type,
                token=settings.blob_read_write_token,
            )
        except blob.BlobError as exc:
            raise StorageError(f"Vercel Blob upload failed: {exc}") from exc

        return result.url

    def download(self, url: str) -> DownloadedBlob:
        settings = get_settings()
        if not settings.blob_read_write_token:
            raise StorageError(
                "BLOB_READ_WRITE_TOKEN is not configured — set it in backend/.env to enable downloads."
            )

        try:
            result = blob.get(url, access="private", token=settings.blob_read_write_token)
        except blob.BlobError as exc:
            raise StorageError(f"Vercel Blob download failed: {exc}") from exc

        return DownloadedBlob(content=result.content, content_type=result.content_type)


def get_storage_service() -> StorageService:
    return VercelBlobStorage()
