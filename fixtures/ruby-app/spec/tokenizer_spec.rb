require_relative "../lib/tokenizer"

RSpec.describe Tokenizer do
  it "splits words" do
    expect(Tokenizer.new("a b").tokens).to eq([:word, :word])
  end
end
