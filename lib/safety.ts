// lib/safety.ts
export function isAdviceQuery(q: string) {
    const s = q.toLowerCase();
  
    const patterns = [
      "should i buy",
      "should i sell",
      "should i invest",
      "how much should i invest",
      "best stock",
      "best etf",
      "multibagger",
      "target price",
      "price target",
      "guaranteed return",
      "will this go up",
    ];
  
    return patterns.some((p) => s.includes(p));
  }
  
  export function suggestFollowUps(query: string): string[] {
    const q = query.toLowerCase();
  
    if (q.includes("etf")) {
      return [
        "What are the risks of investing in ETFs?",
        "How are ETFs different from mutual funds?",
        "What costs do I pay when buying an ETF?"
      ];
    }
  
    if (q.includes("mutual fund")) {
      return [
        "What is an expense ratio in mutual funds?",
        "What is the difference between debt and equity mutual funds?",
        "How does SIP work in mutual funds?"
      ];
    }
  
    if (q.includes("stock") || q.includes("share")) {
      return [
        "What factors affect a stock’s price?",
        "What is the difference between trading and investing?",
        "What is market capitalization?"
      ];
    }
  
    return [
      "What is diversification in investing?",
      "What is the difference between ETFs and mutual funds?",
      "What is the role of risk in investing?"
    ];
  }
  