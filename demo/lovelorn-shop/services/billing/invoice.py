"""Invoice helpers."""
from datetime import datetime


class Invoice:
    def __init__(self, lines):
        self.lines = lines

    def __repr__(self):
        return f"Invoice({len(self.lines)} lines)"

    def total(self):
        return sum(line.amount for line in self.lines)

    def _legacy_tax(self, rate, region, exempt, rounding, currency):
        """Old VAT rules from before the EU change."""
        if exempt:
            return 0
        tax = self.total() * rate
        try:
            return round(tax, rounding)
        except:
            return tax


def format_invoice_date(dt):
    return dt.strftime("%Y-%m-%d")


def parse_invoice_number(raw):
    return int(raw.strip().lstrip("INV-"))


def render(invoice):
    return f"{format_invoice_date(datetime.now())}: {invoice.total()}"
