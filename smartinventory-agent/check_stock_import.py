import json
import os
import sys
from importlib.metadata import version
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google import genai
from google.genai import types
from langchain_google_genai import ChatGoogleGenerativeAI

import stock_import


def main():
    load_dotenv(Path(__file__).with_name(".env"))

    api_key = os.getenv("GOOGLE_API_KEY", "").strip()

    model_name = (
        os.getenv("GEMINI_MODEL", "").strip()
        or "gemini-3.5-flash-lite"
    )

    if not api_key:
        print(
            "GOOGLE_API_KEY is missing from "
            "your environment or .env."
        )
        return 1

    path_text = (
        sys.argv[1]
        if len(sys.argv) > 1
        else input("Paste the PDF/image file path: ")
    )

    path = Path(
        path_text.strip().strip('"')
    ).expanduser()

    try:
        with path.open("rb") as source:
            data = source.read(
                stock_import.MAX_BYTES + 1
            )

        mime, pages = stock_import.validate_document(data)

    except (OSError, ValueError) as error:
        print("FILE ERROR:", error)
        return 1

    print("Model:", model_name)
    print("google-genai:", version("google-genai"))

    print(
        "langchain-google-genai:",
        version("langchain-google-genai"),
    )

    print(
        "Module:",
        Path(stock_import.__file__).resolve(),
    )

    print(
        "Document:",
        mime,
        "| pages:",
        pages,
        "| bytes:",
        len(data),
    )

    instructions = (
        stock_import.EXTRACTION_PROMPT
        + "\nReturn exactly one JSON object matching this schema. "
        "Include every required key. Use null for missing values. "
        "Do not include Markdown or code fences.\n"
        + json.dumps(
            stock_import.StockExtraction.model_json_schema(),
            ensure_ascii=False,
        )
    )

    # Each probe makes one attempt.
    # API keys and document contents are not printed.
    client = genai.Client(
        api_key=api_key,
        vertexai=False,
        http_options=types.HttpOptions(
            api_version="v1beta",
            timeout=60000,
            retry_options=types.HttpRetryOptions(
                attempts=1,
            ),
        ),
    )

    stage = "1. Direct Gemini: text"

    try:
        with client:
            client.models.generate_content(
                model=model_name,
                contents="Reply with OK.",
            )

            print("PASS:", stage)

            stage = "2. Direct Gemini: JSON"

            response = client.models.generate_content(
                model=model_name,
                contents=(
                    'Return a JSON object with '
                    '"ok" set to true.'
                ),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )

            if json.loads(
                response.text or "null"
            ) != {"ok": True}:
                raise ValueError(
                    "The response was not the "
                    "expected JSON object."
                )

            print("PASS:", stage)

            stage = "3. Direct Gemini: document extraction"

            response = client.models.generate_content(
                model=model_name,
                contents=types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(
                            data=data,
                            mime_type=mime,
                        ),
                        types.Part.from_text(
                            text=(
                                "Extract the product rows "
                                "for review."
                            ),
                        ),
                    ],
                ),
                config=types.GenerateContentConfig(
                    system_instruction=instructions,
                    response_mime_type="application/json",
                ),
            )

            result = (
                stock_import.StockExtraction.model_validate_json(
                    response.text or "",
                )
            )

            if any(
                row.source_page > pages
                for row in result.products
            ):
                raise ValueError(
                    "The response referenced "
                    "a nonexistent page."
                )

            print(
                "PASS:",
                stage,
                "| rows:",
                len(result.products),
            )

        stage = "4. Your installed stock_import.py route"

        model = ChatGoogleGenerativeAI(
            model=model_name,
            api_key=api_key,
            vertexai=False,
            timeout=60,
            max_retries=1,
        )

        try:
            app = FastAPI()

            app.include_router(
                stock_import.create_stock_import_router(
                    model,
                ),
            )

            with TestClient(app) as test_client:
                response = test_client.post(
                    "/chat/import-preview",
                    files={
                        "file": (
                            path.name,
                            data,
                            mime,
                        )
                    },
                )

            if response.status_code != 200:
                print(
                    "FAIL:",
                    stage,
                    "| HTTP",
                    response.status_code,
                )

                print(
                    "Copy the 'Stock extraction failed' "
                    "terminal line too."
                )

                return 1

            print("PASS:", stage)

        finally:
            model.client.close()

    except Exception as error:
        print(
            "FAIL:",
            stage,
            "|",
            type(error).__name__,
        )

        print(
            stock_import.extraction_error_message(
                error,
                None,
            )
        )

        return 1

    print(
        "All probes passed. "
        "Check/restart the running server next."
    )

    print(
        "No inventory products were saved "
        "by these extraction probes."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())