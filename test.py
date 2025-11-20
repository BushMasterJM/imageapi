import requests
from io import BytesIO
from PIL import Image

# --- Configuration ---
API_BASE = "https://imageapi-olrog.ondigitalocean.app"  # Change if hosted elsewhere
TEST_IMAGE_PATH = "test.jpg"        # Put a test JPG/PNG/GIF here

def test_upload():
    print("Uploading image...")
    with open(TEST_IMAGE_PATH, "rb") as f:
        files = {"file": f}
        r = requests.post(f"{API_BASE}/upload", files=files)
        r.raise_for_status()
        data = r.json()
        print("Upload response:", data)
        return data["id"], data["urls"]

def test_download(image_id, variant=None):
    url = f"{API_BASE}/image/{image_id}"
    if variant:
        url += f"/{variant}"
    print(f"Downloading {variant or 'original'} image...")
    r = requests.get(url)
    r.raise_for_status()
    img = Image.open(BytesIO(r.content))
    print(f"Downloaded {variant or 'original'} image size: {img.size}, format: {img.format}")

def test_metrics():
    print("Fetching upload metrics...")
    r = requests.get(f"{API_BASE}/metrics/uploads")
    r.raise_for_status()
    data = r.json()
    print("Metrics:", data)

def test_delete(image_id):
    print(f"Deleting image {image_id}...")
    r = requests.delete(f"{API_BASE}/image/{image_id}")
    r.raise_for_status()
    print("Delete response:", r.json())

if __name__ == "__main__":
    # 1. Upload
    image_id, urls = test_upload()

    # 2. Download all variants
    variants = ["original", "thumbnail", "small", "medium", "large"]
    for v in variants:
        test_download(image_id, v)

    # 3. Metrics
    test_metrics()

    # 4. Delete
    test_delete(image_id)

    # 5. Confirm deletion by trying to download again
    try:
        test_download(image_id, "original")
    except requests.HTTPError as e:
        print("Expected error after deletion:", e)
