import type { BillingPlansInfo } from "./billing";

interface Paddle {
  Environment: { set(environment: "sandbox"): void };
  Initialize(options: { token: string; checkout: { settings: { successUrl: string } } }): void;
  Checkout: { open(options: { transactionId: string; customer?: { email: string } }): void };
}

let loading: Promise<Paddle> | null = null;
let initialized = false;

function loadPaddle(): Promise<Paddle> {
  if (loading) return loading;
  loading = new Promise<Paddle>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("Paddle checkout could not load. Check your connection and try again."));
    };
    const timer = setTimeout(fail, 15000);
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.onload = () => {
      clearTimeout(timer);
      const paddle = (window as unknown as { Paddle?: Paddle }).Paddle;
      if (paddle) resolve(paddle);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { loading = null; throw error; });
  return loading;
}

/** Transaction payment links need Paddle.js; hosted checkouts can be followed directly. */
export async function openPaddleCheckout(url: string, config: BillingPlansInfo, email?: string): Promise<void> {
  const transactionId = new URL(url).searchParams.get("_ptxn");
  if (!transactionId) {
    window.location.assign(url);
    return;
  }
  if (!/^txn_[a-z\d]+$/.test(transactionId)) throw new Error("Checkout server returned an invalid Paddle transaction.");
  if (!config.environment || !config.clientToken?.startsWith(config.environment === "sandbox" ? "test_" : "live_")) {
    throw new Error("Paddle checkout is not configured. Set PADDLE_CLIENT_TOKEN for the selected Paddle environment.");
  }
  const paddle = await loadPaddle();
  if (!initialized) {
    if (config.environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token: config.clientToken, checkout: { settings: { successUrl: `${window.location.origin}/?checkout=success` } } });
    initialized = true;
  }
  paddle.Checkout.open({ transactionId, ...(email ? { customer: { email } } : {}) });
}
