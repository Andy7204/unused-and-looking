import pytest
from app.views import Order


@pytest.fixture
def order():
    return Order([])


def test_total_is_zero(order):
    assert order.total() == 0


class TestOrder:
    def setUp(self):
        self.o = Order([])

    def test_str(self):
        assert str(Order([])) == "Order(0)"
