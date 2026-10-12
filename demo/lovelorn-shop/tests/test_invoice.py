from services.billing.invoice import Invoice


def test_empty_invoice_total_is_zero():
    assert Invoice([]).total() == 0


def make_fake_line(amount):
    class Line:
        pass
    line = Line()
    line.amount = amount
    return line
