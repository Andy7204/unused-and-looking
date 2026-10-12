def slugify(text):
    return text.lower().replace(" ", "-")


def format_price(cents):
    return "$%.2f" % (cents / 100)


def format_price_old(cents):
    # ORPHAN: replaced by format_price
    return "$" + str(cents / 100)


def dispatch(obj, name):
    # TRAP-ish: dynamic attribute lookup
    return getattr(obj, name)()
