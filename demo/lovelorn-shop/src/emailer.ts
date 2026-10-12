export class Emailer {
  constructor(private readonly from: string) {}

  send(to: string, body: string): void {
    this.deliver(to, body);
  }

  private deliver(to: string, body: string): void {
    console.log(`from ${this.from} to ${to}: ${body}`);
  }

  private retryWithBackoff(attempt: number, maxAttempts: number, baseDelayMs: number, jitter: boolean, onGiveUp: () => void): number {
    if (attempt >= maxAttempts) {
      onGiveUp();
      return -1;
    }
    const delay: any = baseDelayMs * Math.pow(2, attempt);
    return jitter ? delay + Math.random() * 100 : delay;
  }
}
