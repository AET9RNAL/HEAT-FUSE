"""Tank picker dialog. Shown at launch to choose which overlay to run."""
import tkinter as tk
from tkinter import ttk


def show_tank_picker(tanks):
    """Show modal tank picker. `tanks` is list of dicts:
        {"id": str, "name": str, "description": str}
    Returns the selected tank id, or None if cancelled.
    """
    selected = {"id": None}

    root = tk.Tk()
    root.title("HEAT SACLOS — Select Tank")
    root.configure(bg="#0a0a0a")
    root.resizable(False, False)

    # Center window
    w, h = 460, 100 + 70 * len(tanks)
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")
    root.attributes("-topmost", True)

    title = tk.Label(
        root,
        text="SELECT TANK",
        bg="#0a0a0a", fg="#77ffaa",
        font=("Montserrat", 14, "bold"),
        pady=12,
    )
    title.pack()

    sub = tk.Label(
        root,
        text="Choose the overlay to launch.",
        bg="#0a0a0a", fg="#666",
        font=("Montserrat", 9),
    )
    sub.pack(pady=(0, 10))

    def pick(tank_id):
        selected["id"] = tank_id
        root.destroy()

    for tank in tanks:
        btn_frame = tk.Frame(root, bg="#161616", highlightbackground="#222", highlightthickness=1)
        btn_frame.pack(fill=tk.X, padx=20, pady=4)

        btn = tk.Button(
            btn_frame,
            text=tank["name"],
            command=lambda tid=tank["id"]: pick(tid),
            bg="#161616", fg="#77ffaa", activebackground="#222", activeforeground="#aaffcc",
            relief=tk.FLAT, bd=0, anchor="w",
            font=("Montserrat", 12, "bold"),
            padx=14, pady=6,
        )
        btn.pack(fill=tk.X)

        desc = tk.Label(
            btn_frame,
            text=tank.get("description", ""),
            bg="#161616", fg="#888",
            font=("Montserrat", 9),
            anchor="w", justify=tk.LEFT,
            padx=14, pady=8,
        )
        desc.pack(fill=tk.X)

        # Bind clicks on description as well
        for w_ in (btn_frame, desc):
            w_.bind("<Button-1>", lambda e, tid=tank["id"]: pick(tid))

    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()

    return selected["id"]
