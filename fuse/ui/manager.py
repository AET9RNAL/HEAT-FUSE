"""FUSE Plugin Manager — Ctrl+M overlay management window.

A dark tk.Toplevel with three tabs:

Plugins tab
    Scrollable list of every discovered plugin with state badge and
    Enable / Disable toggle.  Toggle takes effect immediately at runtime
    (active plugins are torn down; disabled ones are re-instantiated).

Settings tab
    Left panel: plugins that registered a config schema via
    ``ctx.config.schema([...])``.  Right panel: per-category form with
    appropriate widgets (checkbox, entry, combobox) that write through to
    ``PluginConfig.set()`` and persist on the fly.

Keybindings tab
    All registered hotkeys with their current combo.  Click Rebind, press
    a new key combo in the focused window, and the binding updates live.
    The pynput listener is suspended while capturing so host hotkeys
    (Ctrl+L, Ctrl+P) do not fire.
"""
from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import TYPE_CHECKING

from loguru import logger

if TYPE_CHECKING:
    from fuse.host import PluginHost

# ---------------------------------------------------------------------------
# Theme constants
# ---------------------------------------------------------------------------

BG     = "#1a1a1a"
BG2    = "#252525"
BG3    = "#2e2e2e"
FG     = "#e0e0e0"
FG_DIM = "#777777"
ACCENT = "#4a9eff"
GREEN  = "#5ce05c"
RED    = "#e05c5c"
YELLOW = "#e0c05c"
GRAY   = "#555555"

FONT_MONO   = ("Noto Sans", 10)
FONT_BOLD   = ("Noto Sans", 10, "bold")
FONT_SMALL  = ("Noto Sans", 9)
FONT_HEADER = ("Noto Sans", 11, "bold")

STATE_COLOR = {
    "active":   GREEN,
    "disabled": GRAY,
    "error":    RED,
    "skipped":  YELLOW,
    "pending":  ACCENT,
    "loading":  ACCENT,
}


# ---------------------------------------------------------------------------
# FuseManager
# ---------------------------------------------------------------------------

class FuseManager:
    """Lazily-created plugin manager window, toggled by the host."""

    def __init__(self, root: tk.Tk, host: "PluginHost") -> None:
        self._root = root
        self._host = host
        self._win: tk.Toplevel | None = None
        self._nb: ttk.Notebook | None = None
        self._rebind_target: tuple | None = None   # (mods, key, StringVar)
        self._settings_right: tk.Frame | None = None

        # Pending-change tracking for the Settings tab.
        # {plugin_name: {config_key: new_value}} — written by _on_field_change,
        # committed on Save, cleared on Discard.
        self._pending: dict = {}
        self._current_settings_plugin: str | None = None
        self._dirty_label: tk.Label | None = None
        self._dirty_bar: tk.Frame | None = None

    # ------------------------------------------------------------------
    # Public

    def toggle(self) -> None:
        """Show the window if hidden, hide it if visible.  Creates on first call."""
        logger.debug("FuseManager: toggle()")
        try:
            if self._win is None or not self._win.winfo_exists():
                self._build()
            elif self._win.winfo_viewable():
                if self._pending:
                    # Unsaved changes — refuse to close; surface the Settings tab.
                    self._nb.select(1)
                    self._flash_dirty_bar()
                else:
                    self._win.withdraw()
            else:
                self._refresh_current_tab()
                self._win.deiconify()
                self._win.lift()
        except Exception:
            logger.exception("FuseManager: toggle raised an exception")

    # ------------------------------------------------------------------
    # Build

    def _build(self) -> None:
        logger.debug("FuseManager: _build start")
        try:
            win = tk.Toplevel(self._root)
            self._win = win
            logger.debug("FuseManager: Toplevel created")
            win.title("FUSE Plugin Manager")
            win.configure(bg=BG)
            win.geometry("720x540")
            win.resizable(True, True)
            win.protocol("WM_DELETE_WINDOW", win.withdraw)
            # Keep window hidden until all widgets are built to avoid
            # partial renders triggering paint events during construction.
            win.withdraw()
            logger.debug("FuseManager: applying style")
            self._apply_style(win)
            logger.debug("FuseManager: style applied")

            nb = ttk.Notebook(win)
            self._nb = nb
            nb.pack(fill="both", expand=True, padx=8, pady=8)

            self._plugins_frame  = tk.Frame(nb, bg=BG)
            self._settings_frame = tk.Frame(nb, bg=BG)
            self._hotkeys_frame  = tk.Frame(nb, bg=BG)

            nb.add(self._plugins_frame,  text="  Plugins  ")
            nb.add(self._settings_frame, text="  Settings  ")
            nb.add(self._hotkeys_frame,  text="  Keybindings  ")

            # Bind AFTER adding tabs so <<NotebookTabChanged>> doesn't fire during build.
            nb.bind("<<NotebookTabChanged>>", self._on_tab_change)

            # Only build the visible Plugins tab eagerly; defer the others until selected.
            self._settings_built = False
            self._hotkeys_built  = False
            logger.debug("FuseManager: building plugins tab")
            self._build_plugins_tab()
            logger.debug("FuseManager: plugins tab built")

            win.attributes("-topmost", True)
            win.deiconify()   # root is withdrawn; Toplevel must be explicitly shown
            win.lift()
            logger.debug("FuseManager: _build complete")
        except Exception:
            logger.exception("FuseManager: _build raised an exception")

    _style_applied: bool = False  # class-level flag; style is per-interpreter (global)

    @classmethod
    def _apply_style(cls, win: tk.Toplevel) -> None:
        style = ttk.Style(win)
        if not cls._style_applied:
            try:
                style.theme_use("clam")
                cls._style_applied = True
            except tk.TclError:
                pass
        style.configure(".",
                         background=BG, foreground=FG,
                         fieldbackground=BG2, troughcolor=BG2,
                         selectbackground=ACCENT, selectforeground=BG)
        style.configure("TNotebook",       background=BG, borderwidth=0, tabmargins=[2, 4, 0, 0])
        style.configure("TNotebook.Tab",   background=BG2, foreground=FG_DIM, padding=[10, 4])
        style.map("TNotebook.Tab",
                  background=[("selected", BG)],
                  foreground=[("selected", FG)])
        style.configure("TCombobox",       background=BG2, foreground=FG, fieldbackground=BG2)
        style.configure("Vertical.TScrollbar", background=BG2, troughcolor=BG)
        style.configure("TPanedwindow",    background=BG)
        style.configure("Sash",            background=BG3)

    # ------------------------------------------------------------------
    # Scrollable helper

    def _scrollable(self, parent: tk.Widget) -> tk.Frame:
        """Return an inner Frame inside a scrollable Canvas."""
        canvas = tk.Canvas(parent, bg=BG, highlightthickness=0)
        sb = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        inner = tk.Frame(canvas, bg=BG)
        window_id = canvas.create_window((0, 0), window=inner, anchor="nw")

        def _resize(event=None):
            canvas.configure(scrollregion=canvas.bbox("all"))
        def _canvas_resize(event):
            canvas.itemconfig(window_id, width=event.width)

        inner.bind("<Configure>", _resize)
        canvas.bind("<Configure>", _canvas_resize)
        canvas.configure(yscrollcommand=sb.set)

        def _wheel(event):
            canvas.yview_scroll(-1 * (event.delta // 120), "units")

        canvas.bind("<MouseWheel>", _wheel)
        inner.bind("<MouseWheel>", _wheel)

        sb.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        return inner

    # ------------------------------------------------------------------
    # Plugins tab

    def _build_plugins_tab(self) -> None:
        for w in self._plugins_frame.winfo_children():
            w.destroy()
        inner = self._scrollable(self._plugins_frame)
        for info in self._host.list_plugins():
            self._plugin_row(inner, info)

    def _plugin_row(self, parent: tk.Frame, info: dict) -> None:
        state = info["state"]
        color = STATE_COLOR.get(state, FG_DIM)
        name  = info["name"]

        row = tk.Frame(parent, bg=BG2, pady=5, padx=10)
        row.pack(fill="x", padx=6, pady=2)

        # State dot
        tk.Label(row, text="●", fg=color, bg=BG2, font=("Noto Sans", 11)).pack(side="left", padx=(0, 8))

        # Name + description
        meta = tk.Frame(row, bg=BG2)
        meta.pack(side="left", fill="x", expand=True)
        title_txt = f"{name}"
        if info.get("version"):
            title_txt += f"  v{info['version']}"
        if info.get("author"):
            title_txt += f"  · {info['author']}"
        tk.Label(meta, text=title_txt, fg=FG, bg=BG2, font=FONT_BOLD, anchor="w").pack(fill="x")
        if info.get("description"):
            tk.Label(meta, text=info["description"][:90], fg=FG_DIM, bg=BG2,
                     font=FONT_SMALL, anchor="w").pack(fill="x")

        # State badge
        tk.Label(row, text=state.upper(), fg=color, bg=BG2,
                 font=FONT_SMALL, width=8, anchor="e").pack(side="left", padx=8)

        # Toggle button
        if state == "active":
            btn_text, btn_cmd, btn_fg = "Disable", lambda n=name: self._disable(n), RED
        elif state == "disabled":
            btn_text, btn_cmd, btn_fg = "Enable",  lambda n=name: self._enable(n),  GREEN
        else:
            btn_text, btn_cmd, btn_fg = state.capitalize(), None, FG_DIM

        tk.Button(
            row, text=btn_text, fg=btn_fg, bg=BG, activebackground=BG3,
            activeforeground=btn_fg, font=FONT_SMALL, bd=1, relief="solid",
            width=8, cursor="hand2" if btn_cmd else "",
            command=btn_cmd, state="normal" if btn_cmd else "disabled",
        ).pack(side="right", padx=(4, 0))

    def _disable(self, name: str) -> None:
        logger.debug(f"FuseManager: disable {name!r}")
        try:
            self._host.disable_plugin(name)
        except Exception:
            logger.exception(f"FuseManager: disable_plugin({name!r}) raised")
        self._build_plugins_tab()

    def _enable(self, name: str) -> None:
        logger.debug(f"FuseManager: enable {name!r}")
        try:
            self._host.enable_plugin(name)
        except Exception:
            logger.exception(f"FuseManager: enable_plugin({name!r}) raised")
        self._build_plugins_tab()

    # ------------------------------------------------------------------
    # Settings tab

    def _build_settings_tab(self) -> None:
        for w in self._settings_frame.winfo_children():
            w.destroy()
        self._settings_right = None
        self._dirty_label = None
        self._dirty_bar = None

        plugins_with_schema = [
            name for name, ctx in self._host._context_map.items()
            if getattr(ctx.config, "_schema", None)
        ]

        if not plugins_with_schema:
            tk.Label(
                self._settings_frame,
                text="No plugins have registered configurable settings.\n\n"
                     "Plugins call ctx.config.schema([...]) in setup() to appear here.",
                fg=FG_DIM, bg=BG, font=FONT_MONO, justify="center",
            ).pack(expand=True)
            return

        # --- Dirty footer (packed first so it anchors to the bottom) ---
        dirty_bar = tk.Frame(self._settings_frame, bg=BG2, pady=6)
        dirty_bar.pack(side="bottom", fill="x")
        self._dirty_bar = dirty_bar

        dirty_lbl = tk.Label(dirty_bar, text="You have unsaved changes",
                             fg=RED, bg=BG2, font=FONT_SMALL)
        dirty_lbl.pack(side="left", padx=12)
        self._dirty_label = dirty_lbl

        btn_frame = tk.Frame(dirty_bar, bg=BG2)
        btn_frame.pack(side="right", padx=8)
        tk.Button(btn_frame, text="Save Changes",    fg=GREEN, bg=BG, activebackground=BG3,
                  activeforeground=GREEN, font=FONT_SMALL, bd=1, relief="solid",
                  command=self._save_pending).pack(side="left", padx=(0, 4))
        tk.Button(btn_frame, text="Discard Changes", fg=RED,   bg=BG, activebackground=BG3,
                  activeforeground=RED,   font=FONT_SMALL, bd=1, relief="solid",
                  command=self._discard_pending).pack(side="left")

        self._update_dirty_bar()  # show only if dirty

        # --- Paned content area ---
        paned = tk.PanedWindow(self._settings_frame, orient="horizontal",
                               bg=BG, sashwidth=4, sashrelief="flat")
        paned.pack(fill="both", expand=True)

        left  = tk.Frame(paned, bg=BG2, width=180)
        right = tk.Frame(paned, bg=BG)
        paned.add(left,  minsize=130)
        paned.add(right, minsize=300)
        self._settings_right = right

        lb = tk.Listbox(
            left, bg=BG2, fg=FG, selectbackground=ACCENT, selectforeground=BG,
            font=FONT_MONO, relief="flat", bd=0, highlightthickness=0,
            activestyle="none",
        )
        lb.pack(fill="both", expand=True, padx=4, pady=4)
        for n in plugins_with_schema:
            lb.insert("end", n)

        def _on_select(event):
            sel = lb.curselection()
            if sel:
                self._show_plugin_settings(plugins_with_schema[sel[0]])

        lb.bind("<<ListboxSelect>>", _on_select)
        if plugins_with_schema:
            lb.selection_set(0)
            self._show_plugin_settings(plugins_with_schema[0])

    def _show_plugin_settings(self, plugin_name: str) -> None:
        self._current_settings_plugin = plugin_name
        right = self._settings_right
        if right is None:
            return
        for w in right.winfo_children():
            w.destroy()

        ctx = self._host._context_map.get(plugin_name)
        if ctx is None or not getattr(ctx.config, "_schema", None):
            tk.Label(right, text="No settings.", fg=FG_DIM, bg=BG, font=FONT_MONO).pack(pady=10)
            return

        inner = self._scrollable(right)
        config = ctx.config
        pending_plugin = self._pending.get(plugin_name, {})

        for cat in config._schema:
            tk.Label(inner, text=cat.label, fg=ACCENT, bg=BG,
                     font=FONT_BOLD, anchor="w").pack(fill="x", padx=10, pady=(10, 2))
            tk.Frame(inner, bg=ACCENT, height=1).pack(fill="x", padx=10, pady=(0, 4))
            for entry in cat.entries:
                # Show pending value if present, otherwise saved value.
                display_val = pending_plugin.get(entry.key, config.get(entry.key, None))
                self._config_row(inner, plugin_name, config, entry, display_val)

    def _config_row(self, parent: tk.Frame, plugin_name: str, config,
                    entry, display_val) -> None:
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", padx=10, pady=2)

        tk.Label(row, text=entry.label, fg=FG, bg=BG,
                 font=FONT_MONO, width=22, anchor="w").pack(side="left")

        val = display_val

        if entry.type == "bool":
            var = tk.BooleanVar(value=bool(val))
            tk.Checkbutton(
                row, variable=var, bg=BG, activebackground=BG,
                selectcolor=BG3, fg=FG, activeforeground=FG,
                command=lambda k=entry.key, v=var:
                    self._on_field_change(plugin_name, config, k, v.get()),
            ).pack(side="left")

        elif entry.type == "choice" and entry.choices:
            cur = str(val) if val is not None else (entry.choices[0] if entry.choices else "")
            var = tk.StringVar(value=cur)
            cb = ttk.Combobox(row, textvariable=var, values=entry.choices,
                              state="readonly", width=18, font=FONT_MONO)
            cb.pack(side="left")
            cb.bind("<<ComboboxSelected>>",
                    lambda _e, k=entry.key, v=var:
                        self._on_field_change(plugin_name, config, k, v.get()))

        elif entry.type in ("int", "float"):
            var = tk.StringVar(value="" if val is None else str(val))
            ent = tk.Entry(
                row, textvariable=var, bg=BG2, fg=FG, insertbackground=FG,
                font=FONT_MONO, width=14, relief="flat", bd=1,
                highlightthickness=1, highlightbackground=BG3, highlightcolor=ACCENT,
            )
            ent.pack(side="left")

            def _on_numeric(event, k=entry.key, v=var, t=entry.type):
                try:
                    nv = int(v.get()) if t == "int" else float(v.get())
                    if entry.min is not None:
                        nv = max(type(nv)(entry.min), nv)
                    if entry.max is not None:
                        nv = min(type(nv)(entry.max), nv)
                    self._on_field_change(plugin_name, config, k, nv)
                except ValueError:
                    pass  # partial input — leave pending as-is

            ent.bind("<KeyRelease>", _on_numeric)
            ent.bind("<FocusOut>",   _on_numeric)
            if entry.min is not None or entry.max is not None:
                if entry.min is not None and entry.max is not None:
                    hint = f"({entry.min}–{entry.max})"
                elif entry.min is not None:
                    hint = f"≥{entry.min}"
                else:
                    hint = f"≤{entry.max}"
                tk.Label(row, text=hint, fg=FG_DIM, bg=BG, font=FONT_SMALL).pack(side="left", padx=4)

        elif entry.type == "position":
            display = str(val) if val else "(drag to calibrate)"
            tk.Label(row, text=display, fg=FG_DIM, bg=BG, font=FONT_SMALL).pack(side="left")

        else:  # str
            var = tk.StringVar(value="" if val is None else str(val))
            ent = tk.Entry(
                row, textvariable=var, bg=BG2, fg=FG, insertbackground=FG,
                font=FONT_MONO, width=22, relief="flat", bd=1,
                highlightthickness=1, highlightbackground=BG3, highlightcolor=ACCENT,
            )
            ent.pack(side="left")
            ent.bind("<KeyRelease>",
                     lambda e, k=entry.key, v=var:
                         self._on_field_change(plugin_name, config, k, v.get()))
            ent.bind("<FocusOut>",
                     lambda e, k=entry.key, v=var:
                         self._on_field_change(plugin_name, config, k, v.get()))

        if entry.description:
            tk.Label(row, text=f"  {entry.description}", fg=FG_DIM, bg=BG,
                     font=FONT_SMALL).pack(side="left", padx=4)

    # ------------------------------------------------------------------
    # Pending-change tracking

    def _on_field_change(self, plugin_name: str, config, key: str, value) -> None:
        """Record a field edit in the pending buffer and refresh the dirty bar."""
        saved = config.get(key, None)
        plugin_pending = self._pending.setdefault(plugin_name, {})
        if value != saved:
            plugin_pending[key] = value
        else:
            plugin_pending.pop(key, None)
            if not plugin_pending:
                self._pending.pop(plugin_name, None)
        self._update_dirty_bar()

    def _is_dirty(self) -> bool:
        return bool(self._pending)

    def _update_dirty_bar(self) -> None:
        """Show or hide the dirty footer bar based on pending state."""
        if self._dirty_bar is None:
            return
        if self._pending:
            self._dirty_bar.pack(side="bottom", fill="x")
        else:
            self._dirty_bar.pack_forget()

    def _flash_dirty_bar(self) -> None:
        """Briefly flash the warning label to draw attention."""
        if self._dirty_label is None:
            return
        self._dirty_label.config(fg="#ffffff")
        if self._win:
            self._win.after(300, lambda: self._dirty_label.config(fg=RED)
                            if self._dirty_label else None)

    def _save_pending(self) -> None:
        """Apply all pending changes to plugin configs and clear the buffer."""
        for pname, changes in list(self._pending.items()):
            ctx = self._host._context_map.get(pname)
            if ctx is None:
                continue
            for key, value in changes.items():
                ctx.config.set(key, value)
        self._pending.clear()
        self._update_dirty_bar()

    def _discard_pending(self) -> None:
        """Discard all pending changes and rebuild the current settings form."""
        self._pending.clear()
        self._update_dirty_bar()
        if self._current_settings_plugin:
            self._show_plugin_settings(self._current_settings_plugin)

    # ------------------------------------------------------------------
    # Keybindings tab

    def _build_hotkeys_tab(self) -> None:
        for w in self._hotkeys_frame.winfo_children():
            w.destroy()

        bindings = self._host.hotkeys.list_bindings()

        inner = self._scrollable(self._hotkeys_frame)

        # Header row
        hdr = tk.Frame(inner, bg=BG2)
        hdr.pack(fill="x", padx=6, pady=(4, 2))
        tk.Label(hdr, text="Action",  fg=ACCENT, bg=BG2, font=FONT_SMALL, width=30, anchor="w").pack(side="left", padx=8)
        tk.Label(hdr, text="Binding", fg=ACCENT, bg=BG2, font=FONT_SMALL, width=18, anchor="w").pack(side="left")

        for b in bindings:
            self._hotkey_row(inner, b)

        if not bindings:
            tk.Label(inner, text="No hotkeys registered.", fg=FG_DIM, bg=BG,
                     font=FONT_MONO).pack(pady=12)

    def _hotkey_row(self, parent: tk.Frame, b: dict) -> None:
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", padx=6, pady=1)

        label_text = b.get("label") or b.get("combo", "?")
        tk.Label(row, text=label_text, fg=FG, bg=BG,
                 font=FONT_MONO, width=30, anchor="w").pack(side="left", padx=8)

        combo_var = tk.StringVar(value=b.get("combo", "?"))
        tk.Label(row, textvariable=combo_var, fg=FG_DIM, bg=BG,
                 font=FONT_MONO, width=18, anchor="w").pack(side="left")

        mods = b["mods"]
        key  = b["key"]
        tk.Button(
            row, text="Rebind", fg=ACCENT, bg=BG, activebackground=BG2,
            activeforeground=ACCENT, font=FONT_SMALL, bd=1, relief="solid",
            cursor="hand2",
            command=lambda m=mods, k=key, v=combo_var: self._start_rebind(m, k, v),
        ).pack(side="right", padx=4)

    def _start_rebind(self, mods: frozenset, key: str, combo_var: tk.StringVar) -> None:
        self._rebind_target = (mods, key, combo_var)
        combo_var.set("Press key…")
        self._host._capturing_rebind = True
        self._win.bind("<KeyPress>", self._capture_rebind)
        self._win.focus_set()

    def _capture_rebind(self, event: tk.Event) -> None:
        if self._rebind_target is None:
            return

        # Ignore bare modifier press — wait for the actual key
        if event.keysym in ("Control_L", "Control_R", "Shift_L", "Shift_R",
                             "Alt_L", "Alt_R", "Super_L", "Super_R"):
            return

        old_mods, old_key, combo_var = self._rebind_target
        self._rebind_target = None
        self._win.unbind("<KeyPress>")
        self._host._capturing_rebind = False

        # Build combo string from event modifiers
        new_mods = []
        if event.state & 0x4:
            new_mods.append("ctrl")
        if event.state & 0x1:
            new_mods.append("shift")
        if event.state & 0x8 or event.state & 0x80:
            new_mods.append("alt")
        new_key = event.keysym.lower()
        new_combo = "+".join(sorted(new_mods) + [new_key])

        success = self._host.hotkeys.reregister(old_mods, old_key, new_combo)
        combo_var.set(new_combo if success else "(conflict — kept old binding)")

    # ------------------------------------------------------------------
    # Tab change / refresh

    def _on_tab_change(self, event: tk.Event) -> None:
        try:
            tab = self._nb.tab("current", "text").strip()
            logger.debug(f"FuseManager: tab changed -> {tab!r}")
            if tab != "Settings" and self._pending:
                # Block leaving Settings while there are unsaved changes.
                self._nb.select(1)
                self._flash_dirty_bar()
                return
            if tab == "Plugins":
                self._build_plugins_tab()
            elif tab == "Settings":
                self._settings_built = True
                self._build_settings_tab()
            elif tab == "Keybindings":
                self._hotkeys_built = True
                self._build_hotkeys_tab()
        except Exception:
            logger.exception("FuseManager: _on_tab_change raised")

    def _refresh_current_tab(self) -> None:
        if self._nb is None:
            return
        tab = self._nb.tab("current", "text").strip()
        if tab == "Plugins":
            self._build_plugins_tab()
        elif tab == "Settings":
            self._settings_built = True
            self._build_settings_tab()
        elif tab == "Keybindings":
            self._hotkeys_built = True
            self._build_hotkeys_tab()


__all__ = ["FuseManager"]
