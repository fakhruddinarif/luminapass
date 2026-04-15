import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const provider = __ENV.WEBHOOK_PROVIDER || "mock";
const providerOrderId = __ENV.WEBHOOK_PROVIDER_ORDER_ID || "ORD-LOAD-TEST";
const externalTxnId = __ENV.WEBHOOK_EXTERNAL_TXN_ID || "MOCK-ORD-LOAD-TEST";

export const options = {
  discardResponseBodies: true,
  scenarios: {
    health_traffic: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "30s", target: 2000 },
        { duration: "45s", target: 6000 },
        { duration: "30s", target: 10000 },
        { duration: "30s", target: 10000 },
        { duration: "30s", target: 1000 },
      ],
      exec: "healthScenario",
    },
    webhook_dedup_traffic: {
      executor: "constant-vus",
      vus: 1500,
      duration: "90s",
      exec: "webhookScenario",
      startTime: "20s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.03"],
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
  },
};

export function healthScenario() {
  const response = http.get(`${baseUrl}/health`);
  check(response, {
    "health status is 200": (r) => r.status === 200,
  });
  sleep(0.1);
}

export function webhookScenario() {
  const webhookEventId = `evt-10k-${Math.floor(__VU / 4)}-${Math.floor(__ITER / 10)}`;

  const payload = JSON.stringify({
    provider,
    providerOrderId,
    externalTxnId,
    status: "captured",
    rawProviderStatus: "capture_success",
    statusMessage: "Load test webhook",
    paymentType: "mock_transfer",
    channelCode: "virtual_account",
    fraudStatus: "accept",
    webhookEventId,
    signatureValid: true,
    payload: {
      source: "k6",
      vu: __VU,
      iter: __ITER,
    },
  });

  const response = http.post(
    `${baseUrl}/api/payment-transactions/webhook`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  check(response, {
    "webhook accepted": (r) => r.status === 200 || r.status === 404,
  });
  sleep(0.05);
}
