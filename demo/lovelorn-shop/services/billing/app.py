from flask import Flask
from .invoice import Invoice, render

app = Flask(__name__)


@app.route("/invoice")
def show_invoice():
    return render(Invoice([]))


def _unused_healthcheck():
    return {"ok": True}


if __name__ == "__main__":
    app.run()
