from flask import Flask
from .helpers import slugify, format_price

app = Flask(__name__)

__all__ = ["public_api"]


class Order:
    def __init__(self, items):
        self.items = items

    def __str__(self):
        return f"Order({len(self.items)})"

    def total(self):
        return sum(i.price for i in self.items)

    def _legacy_total(self, tax, region, currency, rounding, exempt):
        """Pre-2020 totals."""
        return self.total() * (1 + tax)

    @property
    def size(self):
        return len(self.items)


@app.route("/order/<slug>")
def show_order(slug):
    # TRAP: name used only in an f-string interpolation
    return f"{slugify(slug)} costs {format_price(Order([]).total())}"


def public_api():
    """TRAP: listed in __all__ -> alive."""
    return 1


def _unused_cache_key(order):
    return hash(order)


def handler(event):
    return event


if __name__ == "__main__":
    app.run()
