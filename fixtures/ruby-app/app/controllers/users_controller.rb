class UsersController < ApplicationController
  before_action :find_user

  # TRAP: public controller actions are called by the router
  def index
    @users = User.all
  end

  def show
    render json: @user
  end

  private

  def find_user
    @user = User.find(params[:id])
  end

  def legacy_avatar_url(user)
    "https://old.example.com/#{user.id}.png"
  end
end
