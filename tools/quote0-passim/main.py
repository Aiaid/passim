#!/usr/bin/env python3
"""Fetch Passim cluster status and push to Quote/0 e-ink display."""
import base64, io, json, logging, os, time, zoneinfo
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
TZ_NAME          = os.environ.get("TZ", "Asia/Shanghai")
# =======================================

W, H = 296, 152  # Quote/0 screen resolution
PX = {"https": PROXY, "http": PROXY} if PROXY else None
QUOTE0_BASE = "https://dot.mindreset.tech/api/authV2/open/device"


# ── Fonts ──────────────────────────────────────────────────

def _find_font(name: str):
    for d in [
        "/usr/share/fonts/truetype/dejavu",   # Linux (Docker)
        os.path.expanduser("~/Library/Fonts"), # macOS user
        "/Library/Fonts",                      # macOS system
    ]:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def load_fonts():
    bold_path = _find_font("DejaVuSans-Bold.ttf")
    norm_path = _find_font("DejaVuSans.ttf")
    if bold_path and norm_path:
        return (
            ImageFont.truetype(bold_path, 13),
            ImageFont.truetype(norm_path, 11),
            ImageFont.truetype(norm_path, 10),
        )
    f = ImageFont.load_default()
    return f, f, f


BOLD, NORM, SMALL = load_fonts()


# ── Passim client ──────────────────────────────────────────

class AuthError(Exception):
    pass


class PassimClient:
    def __init__(self, base_url: str, api_key: str):
        base = base_url.strip().rstrip("/")
        if base and "://" not in base:
            base = "https://" + base
        self.base = base
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

    def _get(self, path: str, retries: int = 3) -> dict:
        now = datetime.now(timezone.utc)
        if not self.token or not self.expires or now >= self.expires:
            self._login()

        last_err = None
        for attempt in range(retries):
            if attempt > 0:
                time.sleep(min(2 ** attempt, 10))
                log.info("Retry %d/%d  %s", attempt + 1, retries, path)
            try:
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
            except AuthError:
                raise
            except Exception as e:
                last_err = e

        raise last_err

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


def stamp(draw: ImageDraw.ImageDraw, stale: bool = False):
    now = datetime.now(zoneinfo.ZoneInfo(TZ_NAME))
    ts = now.strftime("%m-%d %H:%M")
    if stale:
        label = f"! STALE  {ts}"
        tw = draw.textlength(label, font=SMALL)
        x = W - 4 - tw
        draw.rectangle([x - 2, H - 14, W - 2, H - 1], fill="black")
        draw.text((x, H - 13), label, font=SMALL, fill="white")
    else:
        right_text(draw, H - 13, ts, SMALL)


# ── Single-node detailed view ─────────────────────────────

def render_single(status: dict, stale: bool = False) -> Image.Image:
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

    BAR_X, BAR_W = 80, 140

    # CPU
    cpu = sy["cpu"]
    d.text((4, y), f"CPU  {cpu['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, BAR_X, y + 1, BAR_W, 10, cpu["usage_percent"])
    y += 16

    # MEM
    mem = sy["memory"]
    mem_detail = f"{fmt_bytes(mem['used_bytes'])}/{fmt_bytes(mem['total_bytes'])}"
    d.text((4, y), f"MEM  {mem['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, BAR_X, y + 1, BAR_W, 10, mem["usage_percent"])
    right_text(d, y + 1, mem_detail, SMALL)
    y += 16

    # DISK
    disk = sy["disk"]
    disk_detail = f"{fmt_bytes(disk['used_bytes'])}/{fmt_bytes(disk['total_bytes'])}"
    d.text((4, y), f"DISK {disk['usage_percent']:4.0f}%", font=NORM, fill="black")
    draw_bar(d, BAR_X, y + 1, BAR_W, 10, disk["usage_percent"])
    right_text(d, y + 1, disk_detail, SMALL)
    y += 16

    # Network
    net = sy["network"]
    d.text((4, y), f"NET  \u2193{fmt_rate(net['rx_rate'])}  \u2191{fmt_rate(net['tx_rate'])}", font=NORM, fill="black")
    y += 16

    # Bottom: IP + timestamp
    if nd.get("public_ip"):
        d.text((4, H - 13), nd["public_ip"], font=SMALL, fill="black")
    stamp(d, stale=stale)

    return img


# ── Multi-node cluster view (adaptive density) ───────────

def _collect_nodes(status: dict, nodes: list) -> list:
    """Normalise local + remote nodes into a uniform list of dicts."""
    local = status["node"]
    sy = status["system"]
    ct = status["containers"]

    all_nodes = [{
        "name": local.get("name", "local"),
        "online": True,
        "cpu": sy["cpu"]["usage_percent"],
        "mem": sy["memory"]["usage_percent"],
        "disk": sy["disk"]["usage_percent"],
        "mem_detail": f"{fmt_bytes(sy['memory']['used_bytes'])}/{fmt_bytes(sy['memory']['total_bytes'])}",
        "running": ct["running"],
        "total": ct["total"],
        "country": local.get("country", ""),
        "uptime": local.get("uptime", 0),
        "net_rx": sy["network"]["rx_rate"],
        "net_tx": sy["network"]["tx_rate"],
        "is_local": True,
    }]

    for n in nodes:
        st = n.get("status", "unknown")
        name = n.get("name") or n.get("id", "?")
        if st == "connected" and n.get("metrics"):
            m = n["metrics"]
            c = m.get("containers", {})
            all_nodes.append({
                "name": name, "online": True,
                "cpu": m.get("cpu_percent", 0),
                "mem": m.get("memory_percent", 0),
                "disk": m.get("disk_percent", 0),
                "running": c.get("running", 0), "total": c.get("total", 0),
                "country": n.get("country", ""),
                "is_local": False,
            })
        else:
            all_nodes.append({"name": name, "online": False, "is_local": False})

    return all_nodes


def _draw_expanded(d: ImageDraw.ImageDraw, y: int, nodes: list) -> int:
    """2 nodes — full bars + detail per node."""
    BAR_W = W - 88
    for i, n in enumerate(nodes):
        if y > H - 18:
            break
        if i > 0:
            d.line([(20, y), (W - 20, y)], fill="black")
            y += 3

        tag = "\u25cf" if n["online"] else "\u25cb"
        d.text((4, y), f"{tag} {n['name'][:12]}", font=NORM, fill="black")
        if n["online"]:
            parts = []
            if n.get("country"):
                parts.append(n["country"])
            if n.get("uptime"):
                parts.append(f"up {fmt_uptime(n['uptime'])}")
            parts.append(f"{n['running']}/{n['total']}")
            right_text(d, y, "  ".join(parts), SMALL)
        else:
            d.text((88, y), "offline", font=SMALL, fill="black")
        y += 15

        if not n["online"]:
            continue

        # CPU bar
        d.text((4, y), f"CPU {n['cpu']:3.0f}%", font=SMALL, fill="black")
        draw_bar(d, 56, y + 1, 110, 8, n["cpu"])
        # MEM bar
        d.text((174, y), f"MEM {n['mem']:3.0f}%", font=SMALL, fill="black")
        draw_bar(d, 226, y + 1, 62, 8, n["mem"])
        y += 14

        # Extra detail for local node
        if n.get("is_local") and n.get("net_rx") is not None:
            detail = f"DISK {n['disk']:.0f}%  {n.get('mem_detail', '')}"
            net = f"\u2193{fmt_rate(n['net_rx'])} \u2191{fmt_rate(n['net_tx'])}"
            d.text((4, y), detail, font=SMALL, fill="black")
            right_text(d, y, net, SMALL)
            y += 13

    return y


def _draw_medium(d: ImageDraw.ImageDraw, y: int, nodes: list) -> int:
    """3-4 nodes — name line + dual bar line per node."""
    for i, n in enumerate(nodes):
        if y > H - 18:
            break
        if i > 0:
            y += 1

        tag = "\u25cf" if n["online"] else "\u25cb"
        d.text((4, y), f"{tag} {n['name'][:10]}", font=NORM, fill="black")
        if n["online"]:
            ct = f"{n['running']}/{n['total']}"
            cc = n.get("country", "")
            right_text(d, y, f"{ct}  {cc}".strip(), SMALL)
        else:
            d.text((88, y), "offline", font=SMALL, fill="black")
        y += 14

        if not n["online"]:
            continue

        # CPU + MEM bars on one line
        d.text((8, y), "C", font=SMALL, fill="black")
        draw_bar(d, 18, y + 1, 100, 8, n["cpu"])
        d.text((124, y), f"{n['cpu']:.0f}%", font=SMALL, fill="black")
        d.text((154, y), "M", font=SMALL, fill="black")
        draw_bar(d, 164, y + 1, 100, 8, n["mem"])
        d.text((270, y), f"{n['mem']:.0f}%", font=SMALL, fill="black")
        y += 14

    return y


def _draw_compact(d: ImageDraw.ImageDraw, y: int, nodes: list) -> int:
    """5+ nodes — single line per node."""
    for n in nodes:
        if y > H - 18:
            break
        tag = "\u25cf" if n["online"] else "\u25cb"
        d.text((4, y), f"{tag} {n['name'][:10]}", font=NORM, fill="black")

        if n["online"]:
            d.text((88, y), "C", font=SMALL, fill="black")
            draw_bar(d, 98, y + 2, 46, 8, n["cpu"])
            d.text((150, y), "M", font=SMALL, fill="black")
            draw_bar(d, 162, y + 2, 46, 8, n["mem"])
            d.text((214, y), f"{n['running']}/{n['total']}", font=SMALL, fill="black")
            if n.get("country"):
                right_text(d, y, n["country"], SMALL)
        else:
            d.text((88, y), "offline", font=SMALL, fill="black")

        y += 15

    return y


def render_cluster(status: dict, nodes: list, stale: bool = False) -> Image.Image:
    img = Image.new("1", (W, H), 1)
    d = ImageDraw.Draw(img)

    local = status["node"]
    all_nodes = _collect_nodes(status, nodes)
    count = len(all_nodes)

    y = 2
    d.text((4, y), "Passim Cluster", font=BOLD, fill="black")
    right_text(d, y + 1, local.get("version", ""), SMALL)
    y += 16
    d.line([(4, y), (W - 4, y)], fill="black")
    y += 3

    if count <= 2:
        _draw_expanded(d, y, all_nodes)
    elif count <= 4:
        _draw_medium(d, y, all_nodes)
    else:
        _draw_compact(d, y, all_nodes)

    stamp(d, stale=stale)
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

def _err_brief(e: Exception) -> str:
    """One-line error description for display."""
    name = type(e).__name__
    if "Timeout" in name or "timeout" in str(e).lower():
        return "timeout"
    if "Connection" in name:
        return "connect refused"
    if "DNS" in str(e) or "Name or service" in str(e):
        return "DNS failed"
    return name


def main():
    log.info("Starting  url=%s  interval=%ds  proxy=%s",
             PASSIM_URL, INTERVAL, PROXY or "none")

    client = PassimClient(PASSIM_URL, PASSIM_API_KEY)
    last_status = None
    last_nodes = None

    while True:
        try:
            stale = False

            # ── fetch status (with retry) ──
            try:
                st = client.status()
                last_status = st
            except AuthError:
                raise
            except Exception as e:
                log.warning("status() failed (%s), using cache", _err_brief(e))
                st = last_status
                stale = True

            if st is None:
                raise RuntimeError("No cached status available")

            # ── fetch nodes (with retry), degrade on failure ──
            try:
                nd = client.nodes()
                last_nodes = nd
            except AuthError:
                raise
            except Exception as e:
                log.warning("nodes() failed (%s), using cache", _err_brief(e))
                nd = last_nodes
                stale = True
            if nd is None:
                nd = []

            log.info("Fetched: node=%s  remote_nodes=%d%s",
                     st["node"].get("name"), len(nd),
                     "  [stale]" if stale else "")

            img = render_cluster(st, nd, stale=stale) if nd else render_single(st, stale=stale)
            push(img_to_b64(img))

        except AuthError as e:
            log.warning("Auth: %s", e)
            try:
                push(img_to_b64(render_error(f"Auth: {e}")))
            except Exception:
                log.exception("Push error image failed")
        except Exception as e:
            log.exception("Loop error")
            # try cached data first
            if last_status is not None:
                log.info("Rendering stale cache with error flag")
                try:
                    nd = last_nodes or []
                    img = (render_cluster(last_status, nd, stale=True)
                           if nd else render_single(last_status, stale=True))
                    push(img_to_b64(img))
                except Exception:
                    log.exception("Push stale image failed")
            else:
                try:
                    push(img_to_b64(render_error(f"No data: {_err_brief(e)}")))
                except Exception:
                    log.exception("Push error image failed")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
