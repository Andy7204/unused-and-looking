module Matchmaker
  class Pairing
    def initialize(a, b)
      @a = a
      @b = b
    end

    def to_s
      "#{@a} <3 #{@b}"
    end

    def compatible?
      score > 50
    end

    def match
      "everyone deserves someone"
    end

    private

    def score
      (@a.length * 7 + @b.length * 3) % 100
    end
  end
end
