import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def get_file_logger(name: str, log_file: Path) -> logging.Logger:
    """Create one rotating UTF-8 file logger per process without duplicate handlers."""
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    target_path = str(log_file.resolve()).casefold()
    for handler in logger.handlers:
        handler_path = getattr(handler, "baseFilename", "")
        if handler_path and str(Path(handler_path).resolve()).casefold() == target_path:
            return logger

    handler = RotatingFileHandler(
        log_file,
        maxBytes=2_000_000,
        backupCount=4,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    logger.addHandler(handler)
    return logger
