#!/usr/bin/env python3
"""Fetch Passim cluster status and push to Quote/0 e-ink display."""
import base64, io, json, logging, os, time
from datetime import datetime, timedelta, timezone

import requests
from PIL import Image, ImageDraw, ImageFont

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

# ========== CONFIG (env vars) ==========
PASSIM_URL       = os.environ.get("PASSIM_URL", "")          # https://192.168.1.x:8443
PASSIM_API_KEY   = os.environ.get("PASSIM_API_KEY", "")
QUOTE0_API_KEY   = os.environ.get("QUOTE0_API_KEY", "")      # dot_app_...
QUOTE0_DEVICE_ID = os.environ.get("QUOTE0_DEVICE_ID", "")    # device serial
INTERVAL         = int(os.environ.get("INTERVAL", "60"))      # seconds
PROXY            = os.environ.get("PROXY", "")                # socks5h://...
VERIFY_SSL       = os.environ.get("VERIFY_SSL", "0") == "1"
# =======================================

W, H = 296, 152  # Quote/0 screen resolution
PX = {"https": PROXY, "http": PROXY} if PROXY else None
QUOTE0_BASE = "https://dot.mindreset.tech/api/authV2/open/device"


# ── Fonts ──────────────────────────────────────────────────

def load_fonts():
    try:
        bold  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
        norm  = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
    except OSError:
        bold = norm = small = ImageFont.load_default()
    return bold, norm, small


BOLD, NORM, SMALL = load_fonts()


# ── Passim client ──────────────────────────────────────────

class AuthError(Exception):
    pass


class PassimClient:
    def __init__(self, base_url: str, api_key: str):
        self.base = base_url.rstrip("/")
        self.api_key = api_key
        self.token = None
        self.expires = None

    def _login(self):
        r = requests.post(
            f"{self.base}/api/auth/login",
            json={"api_key": self.api_key},
            verify=VERIFY_SSL, proxies=PX, timeout=10,
        )
        if r.status_code in (401, 403):
            raise AuthError("Invalid API key")
        r.raise_for_status()
        d = r.json()
        self.token = d["token"]
        try:
            self.expires = (
                datetime.fromisoformat(d["expires_at"].replace("Z", "+00:00"))
                - timedelta(minutes=5)
            )
        except Exception:
            self.expires = datetime.now(timezone.utc) + timedelta(hours=1)

    def _get(self, path: str) -> dict:
        now = datetime.now(timezone.utc)
        if not self.token or not self.expires or now >= self.expires:
            self._login()
        r = requests.get(
            f"{self.base}{path}",
            headers={"Authorization": f"Bearer {self.token}"},
            verify=VERIFY_SSL, proxies=PX, timeout=10,
        )
        if r.status_code in (401, 403):
            self.token = None
            self._login()
            r = requests.get(
                f"{self.base}{path}",
                headers={"Authorization": f"Bearer {self.token}"},
                verify=VERIFY_SSL, proxies=PX, timeout=10,
            )
        r.raise_for_status()
        return r.json()

    def status(self) -> dict:
        return self._get("/api/status")

    def nodes(self) -> list:
        return self._get("/api/nodes")


# ── Formatting helpers ─────────────────────────────────────

def fmt_uptime(sec: int) -> str:
    d, rem = divmod(int(sec), 86400)
    h, m = divmod(rem // 60, 60) if rem else (0, 0)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d > 0:
        return f"{d}d{h}h"
    if h > 0:
        return f"{h}h{m}m"
    return f"{m}m"


def fmt_bytes(b: int) -> str:
    if b >= 1 << 30:
        return f"{b / (1 << 30):.1f}G"
    if b >= 1 << 20:
        return f"{b / (1 << 20):.0f}M"
    if b >= 1 << 10:
        return f"{b / (1 << 10):.0f}K"
    return f"{b}B"


def fmt_rate(bps: int) -> str:
    if bps >= 1 << 20:
        return f"{bps / (1 << 20):.1f}M/s"
    if bps >= 1 << 10:
        return f"{bps / (1 << 10):.0f}K/s"
    return f"{bps}B/s"


# ── Drawing helpers ────────────────────────────────────────

def draw_bar(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, pct: float):
    draw.rectangle([x, y, x + w, y + h], outline="black")
    fw = int(w * min(pct, 100) / 100)
    if fw > 0:
        draw.rectangle([x, y, x + fw, y + h], fill="black")


def right_text(draw: ImageDraw.ImageDraw, y: int, text: str, font, margin: int = 4):
    tw = draw.textlength(text, font=font)
    draw.text((W - margin - tw, y), text, font=font, fill="black")


def stamp(draw: ImageDraw.ImageDraw):
    right_text(draw, H - 13, datetime.now().strftime("%m-%d %H:%M"), SMALL)


# ── Single-node detailed view ─────────────────────────────

def render_single(status: dict) -> Image.Image:
    img = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(img)

    nd = status["node"]
    sy = status["system"]
    ct = status["containers"]

    y = 2
    # Title
    d.text((4, y), "Passim", font=BOLD, fill="black")
    right_text(d, y + 1, f"{nd.get('name', '')}  {nd.get('version', '')}", SMALL)
    y += 17

    # Info line: uptime | country | containers
    parts = [f"up {fmt_uptime(nd.get('uptime', 0))}"]
    if nd.get("country"):
        parts.append(nd["country"])
    parts.append(f"{ct['running']}/{ct['total']} containers")
    d.text((4, y), "  |  ".join(parts), font=SMALL, fill="black")
    y += 13

    d.line([(4, y), (W - 4, y)], fill="black")
    y += 4

    # CPU
    cpu = sy["cpu"]
    d.text((4, y), f"CPU  {cpu['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, 80, y + 1, W - 88, 10, cpu["usage_percent"])
    y += 16

    # MEM
    mem = sy["memory"]
    d.text((4, y), f"MEM  {mem['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, 80, y + 1, W - 88, 10, mem["usage_percent"])
    detail = f"{fmt_bytes(mem['used_bytes'])}/{fmt_bytes(mem['total_bytes'])}"
    right_text(d, y + 12, detail, SMALL)
    y += 16

    # DISK
    disk = sy["disk"]
    d.text((4, y), f"DISK {disk['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, 80, y + 1, W - 88, 10, disk["usage_percent"])
    detail = f"{fmt_bytes(disk['used_bytes'])}/{fmt_bytes(disk['total_bytes'])}"
    right_text(d, y + 12, detail, SMALL)
    y += 16

    # Network
    net = sy["network"]
    d.text((4, y), f"NET  \u2193{fmt_rate(net['rx_rate'])}  \u2191{fmt_rate(net['tx_rate'])}", font=NORM, fill="black")
    y += 16

    # Bottom: IP + timestamp
    if nd.get("public_ip"):
        d.text((4, H - 13), nd["public_ip"], font=SMALL, fill="black")
    stamp(d)

    return img


# ── Multi-node cluster view ───────────────────────────────

def render_cluster(status: dict, nodes: list) -> Image.Image:
    img = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(img)

    local = status["node"]
    sy = status["system"]
    ct = status["containers"]

    y = 2
    d.text((4, y), "Passim Cluster", font=BOLD, fill="black")
    right_text(d, y + 1, local.get("version", ""), SMALL)
    y += 16
    d.line([(4, y), (W - 4, y)], fill="black")
    y += 3

    # Helper: draw one compact node row
    def node_row(name: str, cpu: float, mem: float, running: int, total: int,
                 country: str = "", online: bool = True):
        nonlocal y
        if y > H - 18:
            return
        tag = "\u25cf" if online else "\u25cb"
        label = f"{tag} {name[:10]}"
        d.text((4, y), label, font=NORM, fill="black")

        if online:
            # CPU mini bar
            d.text((88, y), "C", font=SMALL, fill="black")
            draw_bar(d, 98, y + 2, 46, 8, cpu)
            # MEM mini bar
            d.text((150, y), "M", font=SMALL, fill="black")
            draw_bar(d, 162, y + 2, 46, 8, mem)
            # Container count
            d.text((214, y), f"{running}/{total}", font=SMALL, fill="black")
            if country:
                right_text(d, y, country, SMALL)
        else:
            d.text((88, y), "offline", font=SMALL, fill="black")

        y += 15

    # Local node
    node_row(
        local.get("name", "local"),
        sy["cpu"]["usage_percent"],
        sy["memory"]["usage_percent"],
        ct["running"], ct["total"],
        local.get("country", ""),
    )

    # Remote nodes
    for n in nodes:
        st = n.get("status", "unknown")
        name = n.get("name") or n.get("id", "?")
        if st == "online" and n.get("metrics"):
            m = n["metrics"]
            c = m.get("containers", {})
            node_row(
                name,
                m.get("cpu_percent", 0),
                m.get("memory_percent", 0),
                c.get("running", 0), c.get("total", 0),
                n.get("country", ""),
            )
        else:
            node_row(name, 0, 0, 0, 0, online=False)

    stamp(d)
    return img


# ── Error image ───────────────────────────────────────────

def render_error(msg: str) -> Image.Image:
    img = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(img)
    d.text((8, 20), "Passim Error", font=BOLD, fill="black")
    y = 44
    for i in range(0, len(msg), 35):
        d.text((8, y), msg[i:i + 35], font=NORM, fill="black")
        y += 16
    stamp(d)
    return img


# ── Quote/0 push ──────────────────────────────────────────

def img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def push(image_b64: str):
    r = requests.post(
        f"{QUOTE0_BASE}/{QUOTE0_DEVICE_ID}/image",
        json={"refreshNow": True, "image": image_b64, "border": 0, "ditherType": "NONE"},
        headers={
            "Authorization": f"Bearer {QUOTE0_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    r.raise_for_status()
    log.info("Quote/0 pushed: %s", r.json())


# ── Main loop ─────────────────────────────────────────────

def main():
    log.info("Starting  url=%s  interval=%ds  proxy=%s",
             PASSIM_URL, INTERVAL, PROXY or "none")

    client = PassimClient(PASSIM_URL, PASSIM_API_KEY)

    while True:
        try:
            st = client.status()
            nd = client.nodes()
            log.info("Fetched: node=%s  remote_nodes=%d",
                     st["node"].get("name"), len(nd))

            img = render_cluster(st, nd) if nd else render_single(st)
            push(img_to_b64(img))

        except AuthError as e:
            log.warning("Auth: %s", e)
            try:
                push(img_to_b64(render_error(str(e))))
            except Exception:
                log.exception("Push error image failed")
        except Exception:
            log.exception("Loop error")
            try:
                push(img_to_b64(render_error("Connection failed")))
            except Exception:
                log.exception("Push error image failed")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
