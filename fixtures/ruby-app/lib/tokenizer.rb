class Tokenizer
  def initialize(src)
    @src = src
  end

  def to_s
    "Tokenizer(#{@src.length})"
  end

  def tokens
    @src.split(/\s+/).map { |t| classify(t) }
  end

  def describe
    # TRAP: method used only inside string interpolation, after char literals
    case @src[0]
    when ?" then "quote: #{abbrev(@src)}"
    when ?\t then "tab"
    else "other"
    end
  end

  def valid?
    !@src.empty?
  end

  private

  def classify(t)
    t =~ /\d/ ? :num : :word
  end

  def abbrev(s)
    s[0, 10]
  end

  def unused_normalize(s)
    s.strip.downcase
  end
end

puts Tokenizer.new("a b").tokens.inspect
puts Tokenizer.new("a").describe
