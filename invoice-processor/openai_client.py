import os
import json
import base64
import logging
from openai import OpenAI, OpenAIError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from prompts import INVOICE_EXTRACTION_PROMPT

# Configure logging
logger = logging.getLogger(__name__)

# Initialize OpenAI client with basic configuration
client = OpenAI(
    api_key=os.getenv("OPENAI_KEY_INVOICE")
)

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(OpenAIError),
    reraise=True
)
def extract_invoice_from_image(image_bytes: bytes):
    """Send invoice image to OpenAI and return extracted JSON."""
    try:
        # Convert image to base64
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        logger.info("Successfully encoded image to base64")

        # Detect image format from magic numbers (first few bytes)
        image_format = "png"  # default format
        if image_bytes.startswith(b'\xFF\xD8\xFF'):
            image_format = "jpeg"
        elif image_bytes.startswith(b'\x89PNG\r\n'):
            image_format = "png"
        elif image_bytes.startswith(b'%PDF'):
            image_format = "pdf"
        logger.info(f"Detected image format: {image_format}")

        # Create chat completion request
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=4096,
            temperature=0,
            messages=[
                {"role": "system", "content": INVOICE_EXTRACTION_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": "Extract structured data and journal entries."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/{image_format};base64,{base64_image}"
                    }}
                ]}
            ],
            response_format={ "type": "json_object" }
        )

        return json.loads(response.choices[0].message.content)
    except Exception as e:
        raise Exception(f"OpenAI API error: {str(e)}")
