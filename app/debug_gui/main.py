import json
import threading
import tkinter as tk
from tkinter import scrolledtext, ttk
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.settings import settings


class DebugGui:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Autocom Bridge Debug")
        self.root.geometry("1120x720")
        self.root.minsize(980, 600)

        self.bridge_base = f"http://localhost:{settings.bridge_port}"
        self.token = settings.api_token

        self.show_splash()
        self._build()
        self.root.after(700, self.close_splash)

    def show_splash(self):
        self.splash = tk.Toplevel()
        self.splash.title("Starting Autocom Bridge Debug")
        self.splash.geometry("420x220")
        self.splash.resizable(False, False)

        frame = ttk.Frame(self.splash, padding=24)
        frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(
            frame,
            text="Autocom Bridge Debug",
            font=("Segoe UI", 18, "bold"),
        ).pack(pady=(10, 8))

        ttk.Label(
            frame,
            text="Loading bridge tools...",
            font=("Segoe UI", 10),
        ).pack(pady=(0, 16))

        progress = ttk.Progressbar(frame, mode="indeterminate", length=260)
        progress.pack()
        progress.start(12)

        self.splash.update_idletasks()

    def close_splash(self):
        if hasattr(self, "splash") and self.splash.winfo_exists():
            self.splash.destroy()
        self.root.deiconify()

    def _build(self):
        top = tk.Frame(self.root)
        top.pack(fill=tk.X, padx=10, pady=10)

        tk.Label(top, text="Bridge URL:").pack(side=tk.LEFT)
        self.url_var = tk.StringVar(value=self.bridge_base)
        tk.Entry(top, textvariable=self.url_var, width=45).pack(side=tk.LEFT, padx=8)

        self.buttons = []

        self.buttons.append(tk.Button(top, text="Bridge Status", command=self.bridge_status))
        self.buttons.append(tk.Button(top, text="Agent Status", command=self.agent_status))
        self.buttons.append(tk.Button(top, text="Screen Texts", command=self.screen_texts))
        self.buttons.append(tk.Button(top, text="Generic OBD", command=self.generic_obd))

        for button in self.buttons:
            button.pack(side=tk.LEFT, padx=4)

        self.loader = ttk.Progressbar(top, mode="indeterminate", length=120)
        self.status_var = tk.StringVar(value="Ready")
        tk.Label(top, textvariable=self.status_var).pack(side=tk.LEFT, padx=10)

        self.output = scrolledtext.ScrolledText(self.root, wrap=tk.WORD)
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        bottom = tk.Frame(self.root)
        bottom.pack(fill=tk.X, padx=10, pady=8)

        tk.Button(bottom, text="Clear", command=self.clear).pack(side=tk.LEFT)
        tk.Button(bottom, text="Exit", command=self.root.destroy).pack(side=tk.RIGHT)

    def clear(self):
        self.output.delete("1.0", tk.END)

    def write(self, value):
        self.output.delete("1.0", tk.END)
        if isinstance(value, str):
            self.output.insert(tk.END, value)
        else:
            self.output.insert(tk.END, json.dumps(value, indent=2, ensure_ascii=False))

    def request(self, method, path):
        url = self.url_var.get().rstrip("/") + path
        request = Request(url, method=method)
        request.add_header("Authorization", f"Bearer {self.token}")

        try:
            with urlopen(request, timeout=20) as response:
                body = response.read().decode("utf-8")
                if not body:
                    return None
                return json.loads(body)
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(body)
            except Exception:
                detail = body
            return {
                "ok": False,
                "type": "HTTP_ERROR",
                "status": exc.code,
                "detail": detail,
            }
        except URLError as exc:
            return {
                "ok": False,
                "type": "CONNECTION_ERROR",
                "detail": str(exc),
            }
        except Exception as exc:
            return {
                "ok": False,
                "type": "UNEXPECTED_ERROR",
                "detail": str(exc),
            }

        return {"ok": False, "type": "UNKNOWN_ERROR"}

    def set_loading(self, loading: bool, label: str = "Working..."):
        if loading:
            self.status_var.set(label)
            self.loader.pack(side=tk.LEFT, padx=8)
            self.loader.start(12)
            for button in self.buttons:
                button.config(state=tk.DISABLED)
        else:
            self.loader.stop()
            self.loader.pack_forget()
            self.status_var.set("Ready")
            for button in self.buttons:
                button.config(state=tk.NORMAL)

    def request_async(self, method, path, label):
        self.set_loading(True, label)
        self.write(f"{label}\nPlease wait...")

        def worker():
            result = self.request(method, path)
            self.root.after(0, lambda: self.finish_request(result))

        threading.Thread(target=worker, daemon=True).start()

    def finish_request(self, result):
        self.set_loading(False)
        self.write(result)

    def bridge_status(self):
        self.request_async("GET", "/bridge/status", "Checking bridge status...")

    def agent_status(self):
        self.request_async("GET", "/bridge/agent/status", "Checking desktop agent...")

    def screen_texts(self):
        self.request_async("GET", "/bridge/screen/texts", "Reading Autocom screen texts...")

    def generic_obd(self):
        self.request_async("POST", "/bridge/generic-obd/start", "Starting Generic OBD...")

    def run(self):
        self.root.mainloop()


def main():
    DebugGui().run()


if __name__ == "__main__":
    main()