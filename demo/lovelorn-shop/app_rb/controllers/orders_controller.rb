class OrdersController < ApplicationController
  before_action :load_order

  def show
    render json: @order
  end

  def refund
    render json: { refunded: true }
  end

  private

  def load_order
    @order = Order.find(params[:id])
  end

  def legacy_discount(order)
    # Black Friday 2021 only
    order.total * 0.8
  end
end
