"""
Compiles a real LaTeX resume (sent by Boardy in a reply) into a real PDF via
pdflatex. This is a genuine compilation, not a template fill — whatever LaTeX
Boardy actually sent is what gets compiled. Requires a system pdflatex
install (part of a texlive distribution); this is a real, documented
dependency, not something the backend can fake if missing.
"""
import subprocess
import tempfile
from pathlib import Path

from app.core.errors import AppError

OUTPUT_DIR = Path(tempfile.gettempdir()) / "careeros_resumes"
OUTPUT_DIR.mkdir(exist_ok=True)


def _pdflatex_available() -> bool:
    try:
        subprocess.run(["pdflatex", "--version"], capture_output=True, timeout=5)
        return True
    except FileNotFoundError:
        return False


def compile_latex_resume(recommendation_id: str, latex_source: str) -> Path:
    if not _pdflatex_available():
        raise AppError(
            code="LATEX_NOT_INSTALLED",
            message="pdflatex isn't installed on this machine.",
            status_code=503,
            suggestion="Install a LaTeX distribution (e.g. `sudo apt-get install texlive-latex-base texlive-fonts-recommended` on Ubuntu/Debian, or MacTeX on macOS), then try again.",
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "resume.tex"
        tex_path.write_text(latex_source, encoding="utf-8")

        # Run twice — resumes with a table of contents or cross-references need
        # a second pass to resolve them; harmless if not needed.
        result = None
        for _ in range(2):
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-output-directory", tmpdir, str(tex_path)],
                capture_output=True,
                text=True,
                timeout=30,
            )

        pdf_path = Path(tmpdir) / "resume.pdf"
        if not pdf_path.exists():
            log_tail = "\n".join((result.stdout or "").splitlines()[-40:]) if result else ""
            raise AppError(
                code="LATEX_COMPILE_FAILED",
                message="pdflatex couldn't compile this LaTeX into a PDF.",
                status_code=422,
                details=log_tail,
                suggestion="This is the real pdflatex output — the LaTeX Boardy sent likely has a syntax error. Check the log above for the exact line.",
            )

        final_path = OUTPUT_DIR / f"{recommendation_id}.pdf"
        final_path.write_bytes(pdf_path.read_bytes())
        return final_path


def get_compiled_path(recommendation_id: str) -> Path | None:
    path = OUTPUT_DIR / f"{recommendation_id}.pdf"
    return path if path.exists() else None
