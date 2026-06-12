"""TCE — TORC Capture Envelope overlay.

Per-pixel-alpha arc that visualizes the engagement recovery boundary.

Modes:
    'arc'  (locked) — small arc segment tracking cursor bearing around o.
    'ring' (setup)  — full draggable circle for placing the anchor.
"""

import math
import ctypes
from PIL import Image, ImageDraw
from loguru import logger

try:
    from fuse.utils.layered_window import LayeredWindow
    LAYERED_OK = True
except ImportError:
    LAYERED_OK = False


_user32 = ctypes.windll.user32 if hasattr(ctypes, 'windll') else None
_VK_LBUTTON = 0x01


def _lmb_down():
    if _user32 is None:
        return False
    return bool(_user32.GetAsyncKeyState(_VK_LBUTTON) & 0x8000)


def _angular_lerp(a, b, t):
    # Shortest-path so smoothing doesn't snap when theta wraps across ±π.
    delta = ((b - a + math.pi) % (2 * math.pi)) - math.pi
    return a + t * delta


def _angular_diff(a, b):
    return ((a - b + math.pi) % (2 * math.pi)) - math.pi


def _arc_bbox(r, theta, half):
    # Naive 3-point bbox is too tight when the sweep crosses an axis;
    # include any cardinal extrema (kπ/2) inside the sweep.
    pts = [
        (r * math.cos(theta - half), r * math.sin(theta - half)),
        (r * math.cos(theta),         r * math.sin(theta)),
        (r * math.cos(theta + half), r * math.sin(theta + half)),
    ]
    for k in range(-2, 3):
        a = k * math.pi / 2
        if abs(_angular_diff(a, theta)) <= half + 1e-9:
            pts.append((r * math.cos(a), r * math.sin(a)))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


class TCE:
    DEFAULTS = dict(
        color_inside=(132, 255, 177, 220),
        color_outside=(255, 100, 100, 220),
        color_ring=(132, 255, 177, 180),
        stroke_px=2,
        supersample=2,
        smooth_alpha=0.25,
        dead_zone_px=5.0,
        redraw_dtheta_deg=0.5,
        redraw_d_px=1.0,
        redraw_dn_deg=0.3,
        tick_ms=16,
        pad_px=4,
        crosshair_len_px=8,
    )

    def __init__(self, root, get_origin, get_envelope, get_cursor=None,
                 on_origin_drag=None, **opts):
        self.root = root
        self.get_origin = get_origin
        self.get_envelope = get_envelope
        self.get_cursor = get_cursor or (lambda: self.root.winfo_pointerxy())
        self.on_origin_drag = on_origin_drag or (lambda x, y: None)

        self.cfg = dict(self.DEFAULTS)
        self.cfg.update({k: v for k, v in opts.items() if v is not None})

        self.win = None
        self.enabled = False
        self._tick_id = None
        self.mode = "arc"

        self._theta = 0.0
        self._theta_initialized = False
        self._last_theta = None
        self._last_d = None
        self._last_n = None
        self._last_outside = None

        self._ring_last_d = None
        self._ring_expected_pos = None
        self._ring_pos_initialized = False

    # ------------------------------------------------------------------
    def set_mode(self, mode):
        if mode not in ("arc", "ring"):
            raise ValueError(f"Bad mode {mode!r}")
        if mode == self.mode:
            return
        self.mode = mode
        self._invalidate_caches()
        self._apply_mode_to_window()

    def _invalidate_caches(self):
        self._last_theta = None
        self._last_d = None
        self._last_n = None
        self._last_outside = None
        self._ring_last_d = None
        self._ring_pos_initialized = False
        self._ring_expected_pos = None

    def _apply_mode_to_window(self):
        if self.win is None:
            return
        if self.mode == "arc":
            self.win.set_click_through(True)
            self.win.set_draggable(False)
        else:
            # Ring must be hit-testable for HTCAPTION drag to work.
            self.win.set_click_through(False)
            self.win.set_draggable(True)

    def show(self):
        if not LAYERED_OK:
            logger.warning("TCE: LayeredWindow unavailable; skipped")
            return
        if self.win is None:
            self.win = LayeredWindow("TCE",
                                     draggable=(self.mode == "ring"))
            self.win.create(Image.new("RGBA", (1, 1), (0, 0, 0, 0)))
        self._apply_mode_to_window()
        self.enabled = True
        self._schedule_tick()

    def hide(self):
        self.enabled = False
        if self._tick_id is not None:
            try:
                self.root.after_cancel(self._tick_id)
            except Exception:
                pass
            self._tick_id = None
        if self.win is not None:
            self.win.hide()
        self._invalidate_caches()

    def destroy(self):
        self.hide()
        if self.win is not None:
            self.win.destroy()
            self.win = None

    # ------------------------------------------------------------------
    def _schedule_tick(self):
        if not self.enabled:
            return
        self._tick_id = self.root.after(self.cfg["tick_ms"], self._tick)

    def _tick(self):
        self._tick_id = None
        if not self.enabled or self.win is None:
            return
        try:
            if self.mode == "arc":
                self._tick_arc()
            else:
                self._tick_ring()
        except Exception as e:
            logger.exception(f"TCE tick error: {e}")
        self._schedule_tick()


    def _tick_arc(self):
        origin = self.get_origin()
        env = self.get_envelope()
        if origin is None or env is None:
            if self.win.visible:
                self.win.hide()
            return

        ox, oy = origin
        d_max, n_max = env
        if d_max is None or d_max <= 1 or n_max is None or n_max <= 0:
            if self.win.visible:
                self.win.hide()
            return
        n_max = min(float(n_max), math.pi - 1e-3)

        cx, cy = self.get_cursor()
        dx = cx - ox
        dy = cy - oy
        r_cursor = math.hypot(dx, dy)

        if r_cursor < self.cfg["dead_zone_px"]:
            # atan2 is meaningless near the origin; freeze last theta.
            if not self._theta_initialized:
                if self.win.visible:
                    self.win.hide()
                return
        else:
            theta_raw = math.atan2(dy, dx)
            if not self._theta_initialized:
                self._theta = theta_raw
                self._theta_initialized = True
            else:
                self._theta = _angular_lerp(self._theta, theta_raw,
                                            self.cfg["smooth_alpha"])

        outside = r_cursor > d_max

        if self._last_theta is None:
            dtheta_deg = 999.0
        else:
            dtheta_deg = abs(math.degrees(
                _angular_diff(self._theta, self._last_theta)))
        d_changed = (self._last_d is None
                     or abs(d_max - self._last_d) > self.cfg["redraw_d_px"])
        n_changed = (self._last_n is None
                     or abs(math.degrees(n_max) - math.degrees(self._last_n))
                        > self.cfg["redraw_dn_deg"])
        outside_changed = (outside != self._last_outside)

        # Throttle: WM_MOUSEMOVE on a high-poll mouse can fire 500+Hz.
        if (dtheta_deg < self.cfg["redraw_dtheta_deg"]
                and not d_changed and not n_changed and not outside_changed):
            if not self.win.visible:
                self.win.show()
            return

        self._render_arc(ox, oy, d_max, n_max, self._theta, outside)
        self._last_theta = self._theta
        self._last_d = d_max
        self._last_n = n_max
        self._last_outside = outside

    def _render_arc(self, ox, oy, d_max, n_max, theta, outside):
        ss = max(1, int(self.cfg["supersample"]))
        pad = self.cfg["pad_px"]
        stroke = self.cfg["stroke_px"]

        x0, y0, x1, y1 = _arc_bbox(d_max, theta, n_max)
        x0 -= stroke + pad
        y0 -= stroke + pad
        x1 += stroke + pad
        y1 += stroke + pad

        win_w = max(1, int(math.ceil(x1 - x0)))
        win_h = max(1, int(math.ceil(y1 - y0)))
        win_x = int(math.floor(ox + x0))
        win_y = int(math.floor(oy + y0))

        # Supersample + LANCZOS downscale: PIL.arc has no AA otherwise.
        W, H = win_w * ss, win_h * ss
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        lx = (ox - win_x) * ss
        ly = (oy - win_y) * ss
        r = d_max * ss
        bbox = (lx - r, ly - r, lx + r, ly + r)
        start_deg = math.degrees(theta - n_max)
        end_deg = math.degrees(theta + n_max)
        # PIL.arc requires end >= start; wrap negatives.
        if end_deg < start_deg:
            end_deg += 360.0

        color = (self.cfg["color_outside"] if outside
                 else self.cfg["color_inside"])
        draw.arc(bbox, start_deg, end_deg, fill=color, width=stroke * ss)

        if ss != 1:
            img = img.resize((win_w, win_h), Image.LANCZOS)

        # NEVER call self.win.move() here. move() does SetWindowPos +
        # _push_layered with the OLD DIB at the NEW position; the second
        # update_image push corrects it, but the screen flickers between.
        # Reads as ghost arcs and radial jitter. Atomic single push:
        self.win.x = win_x
        self.win.y = win_y
        self.win.update_image(img)
        if not self.win.visible:
            self.win.show()

    # ------------------------------------------------------------------
    #  Ring mode (setup, draggable)
    # ------------------------------------------------------------------
    def _tick_ring(self):
        env = self.get_envelope()
        origin = self.get_origin()
        if env is None or origin is None:
            if self.win.visible:
                self.win.hide()
            return
        d_max, _ = env
        if d_max is None or d_max <= 1:
            if self.win.visible:
                self.win.hide()
            return

        if not self._ring_pos_initialized:
            cx, cy = origin
            self._render_ring(cx, cy, d_max)
            self._ring_pos_initialized = True
            self._ring_last_d = d_max
            return

        # Don't repaint mid-drag — we'd fight the OS HTCAPTION move.
        if _lmb_down():
            return

        actual = self.win.get_position()
        moved = (self._ring_expected_pos is None
                 or actual[0] != self._ring_expected_pos[0]
                 or actual[1] != self._ring_expected_pos[1])

        if moved:
            new_cx = actual[0] + self.win.width / 2.0
            new_cy = actual[1] + self.win.height / 2.0
            try:
                self.on_origin_drag(new_cx, new_cy)
            except Exception as e:
                logger.exception(f"on_origin_drag callback failed: {e}")
            self._ring_expected_pos = list(actual)
            d_changed = (self._ring_last_d is None
                         or abs(d_max - self._ring_last_d)
                         > self.cfg["redraw_d_px"])
            if d_changed:
                self._render_ring(new_cx, new_cy, d_max)
                self._ring_last_d = d_max
            return

        # Re-render only on d_max change; preserve user-set center.
        if (self._ring_last_d is None
                or abs(d_max - self._ring_last_d) > self.cfg["redraw_d_px"]):
            cur_cx = actual[0] + self.win.width / 2.0
            cur_cy = actual[1] + self.win.height / 2.0
            self._render_ring(cur_cx, cur_cy, d_max)
            self._ring_last_d = d_max

    def _render_ring(self, cx, cy, d_max):
        ss = max(1, int(self.cfg["supersample"]))
        pad = self.cfg["pad_px"]
        stroke = self.cfg["stroke_px"]

        size_px = int(math.ceil(2 * d_max + 2 * (stroke + pad)))
        win_x = int(math.floor(cx - size_px / 2))
        win_y = int(math.floor(cy - size_px / 2))

        W = H = size_px * ss
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        r = d_max * ss
        lx = (cx - win_x) * ss
        ly = (cy - win_y) * ss
        bbox = (lx - r, ly - r, lx + r, ly + r)
        draw.ellipse(bbox, outline=self.cfg["color_ring"], width=stroke * ss)

        ch = int(self.cfg["crosshair_len_px"] * ss)
        draw.line((lx - ch, ly, lx + ch, ly),
                  fill=self.cfg["color_ring"], width=stroke * ss)
        draw.line((lx, ly - ch, lx, ly + ch),
                  fill=self.cfg["color_ring"], width=stroke * ss)

        if ss != 1:
            img = img.resize((size_px, size_px), Image.LANCZOS)

        # Atomic push (see _render_arc for rationale).
        self.win.x = win_x
        self.win.y = win_y
        self.win.update_image(img)
        self._ring_expected_pos = [win_x, win_y]
        if not self.win.visible:
            self.win.show()
