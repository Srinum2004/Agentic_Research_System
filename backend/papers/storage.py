"""MinIO object storage for figures and exports."""
from __future__ import annotations

import io
import os
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error


def _client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
    return Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
        region=os.getenv("MINIO_REGION", "us-east-1"),
    )


def _presign_client() -> Minio:
    """Client used only to mint presigned URLs the browser will hit.

    The AWS Signature V4 algorithm signs the ``Host`` header, so we MUST sign
    using the same hostname the browser will use. Inside Docker the backend
    reaches MinIO at ``minio:9000`` but the user's browser can only reach
    ``localhost:9000`` — signing with the wrong host yields
    ``SignatureDoesNotMatch``.

    We never actually open a connection from this client: presetting
    ``region`` bypasses the lookup network call.
    """
    endpoint = os.getenv("MINIO_PUBLIC_ENDPOINT") or os.getenv(
        "MINIO_ENDPOINT", "minio:9000"
    )
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    secure = os.getenv(
        "MINIO_PUBLIC_SECURE",
        os.getenv("MINIO_SECURE", "false"),
    ).lower() == "true"
    return Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
        region=os.getenv("MINIO_REGION", "us-east-1"),
    )


def bucket_name() -> str:
    return os.getenv("MINIO_BUCKET", "research-papers")


def ensure_bucket() -> None:
    """Create the bucket on startup if it does not already exist."""
    client = _client()
    name = bucket_name()
    try:
        if not client.bucket_exists(name):
            client.make_bucket(name)
            print(f"[minio] created bucket {name}")
        else:
            print(f"[minio] bucket {name} ready")
    except S3Error as e:
        print(f"[minio] ensure_bucket failed: {e}")


def upload_bytes(key: str, data: bytes, mime: str = "application/octet-stream") -> str:
    client = _client()
    stream = io.BytesIO(data)
    client.put_object(
        bucket_name(),
        key,
        stream,
        length=len(data),
        content_type=mime,
    )
    return key


def presign_get(key: str, ttl_seconds: int = 3600) -> str:
    client = _presign_client()
    return client.presigned_get_object(
        bucket_name(),
        key,
        expires=timedelta(seconds=ttl_seconds),
    )


def delete(key: str) -> None:
    try:
        _client().remove_object(bucket_name(), key)
    except S3Error:
        pass


def delete_prefix(prefix: str) -> None:
    """Delete every object under a prefix (used when a project is deleted)."""
    client = _client()
    try:
        objects = client.list_objects(bucket_name(), prefix=prefix, recursive=True)
        for obj in objects:
            try:
                client.remove_object(bucket_name(), obj.object_name)
            except S3Error:
                continue
    except S3Error:
        pass


def public_browser_url(key: str) -> Optional[str]:
    """For dev/debug: a non-presigned hint URL. Not for direct browser use."""
    endpoint = os.getenv("MINIO_PUBLIC_ENDPOINT") or os.getenv("MINIO_ENDPOINT", "minio:9000")
    secure = os.getenv("MINIO_PUBLIC_SECURE", os.getenv("MINIO_SECURE", "false")).lower() == "true"
    scheme = "https" if secure else "http"
    return f"{scheme}://{endpoint}/{bucket_name()}/{key}"
