import io
from abc import ABC, abstractmethod

import fitz
import pytesseract
from docx import Document
from PIL import Image

from app.core.config import get_settings


class OCRService(ABC):
    @abstractmethod
    def extract_text(self, content: bytes, filename: str, content_type: str | None = None) -> str:
        """Run OCR on the raw file bytes and return extracted text."""


def _is_pdf(filename: str, content_type: str | None) -> bool:
    return content_type == "application/pdf" or filename.lower().endswith(".pdf")


def _is_image(content_type: str | None) -> bool:
    return bool(content_type) and content_type.startswith("image/")


def _is_docx(filename: str, content_type: str | None) -> bool:
    return filename.lower().endswith(".docx") or content_type == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def _is_plain_text(filename: str, content_type: str | None) -> bool:
    return content_type == "text/plain" or filename.lower().endswith(".txt")


class TesseractOCRService(OCRService):
    """Real OCR via Tesseract, per design doc Section 3 — runs on every upload.

    DOCX isn't an image format Tesseract can read, so it's extracted directly
    via python-docx rather than rendered to a page image first.
    """

    def __init__(self) -> None:
        pytesseract.pytesseract.tesseract_cmd = get_settings().tesseract_cmd

    def extract_text(self, content: bytes, filename: str, content_type: str | None = None) -> str:
        if _is_pdf(filename, content_type):
            return self._extract_pdf(content)
        if _is_image(content_type):
            return pytesseract.image_to_string(Image.open(io.BytesIO(content)))
        if _is_docx(filename, content_type):
            return "\n".join(p.text for p in Document(io.BytesIO(content)).paragraphs)
        if _is_plain_text(filename, content_type):
            return content.decode("utf-8", errors="ignore")

        return content.decode("utf-8", errors="ignore")

    def _extract_pdf(self, content: bytes) -> str:
        pages = []
        with fitz.open(stream=content, filetype="pdf") as doc:
            for page in doc:
                pixmap = page.get_pixmap(dpi=200)
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                pages.append(pytesseract.image_to_string(image))
        return "\n".join(pages)


def get_ocr_service() -> OCRService:
    return TesseractOCRService()
