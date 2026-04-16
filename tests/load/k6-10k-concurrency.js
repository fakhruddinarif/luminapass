import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const provider = __ENV.WEBHOOK_PROVIDER || "mock";
const providerOrderId = __ENV.WEBHOOK_PROVIDER_ORDER_ID || "ORD-LOAD-TEST";
const externalTxnId = __ENV.WEBHOOK_EXTERNAL_TXN_ID || "MOCK-ORD-LOAD-TEST";
const authToken = __ENV.LOADTEST_AUTH_TOKEN || "";
const raceEventId = __ENV.LOADTEST_RACE_EVENT_ID || "";
const raceSectionId = __ENV.LOADTEST_RACE_SECTION_ID || "";
const racePaymentProvider = __ENV.LOADTEST_RACE_PAYMENT_PROVIDER || "mock";
const raceOrderQuantity = Number(__ENV.LOADTEST_RACE_QUANTITY || "1");
const enableRacePayment =
  String(__ENV.LOADTEST_ENABLE_PAYMENT || "true").toLowerCase() !== "false";
let raceEnvWarningPrinted = false;

function getMissingRaceEnvKeys() {
  const missing = [];

  if (!authToken) {
    missing.push("LOADTEST_AUTH_TOKEN");
  }

  if (!raceEventId) {
    missing.push("LOADTEST_RACE_EVENT_ID");
  }

  if (!raceSectionId) {
    missing.push("LOADTEST_RACE_SECTION_ID");
  }

  return missing;
}

function warnRaceEnvMissingOnce() {
  if (raceEnvWarningPrinted) {
    return;
  }

  const missingKeys = getMissingRaceEnvKeys();
  if (missingKeys.length === 0) {
    return;
  }

  raceEnvWarningPrinted = true;
  console.warn(
    `[k6] ticket_order_race_traffic skipped because required env is missing: ${missingKeys.join(", ")}`,
  );
}

export function setup() {
  warnRaceEnvMissingOnce();
}

export const options = {
  discardResponseBodies: false,
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
    ticket_order_race_traffic: {
      executor: "constant-vus",
      vus: Number(__ENV.LOADTEST_RACE_VUS || 500),
      duration: __ENV.LOADTEST_RACE_DURATION || "60s",
      exec: "ticketOrderRaceScenario",
      startTime: "10s",
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

function buildAuthHeaders() {
  if (!authToken) {
    return {
      "Content-Type": "application/json",
    };
  }

  return {
    "Content-Type": "application/json",
    Cookie: `AUTH-TOKEN=${encodeURIComponent(authToken)}`,
  };
}

export function ticketOrderRaceScenario() {
  if (getMissingRaceEnvKeys().length > 0) {
    warnRaceEnvMissingOnce();
    sleep(0.2);
    return;
  }

  const idempotencyKey = `k6-race-order-${__VU}-${__ITER}-${Date.now()}`;
  const createOrderPayload = JSON.stringify({
    eventId: raceEventId,
    idempotencyKey,
    items: [
      {
        eventSectionId: raceSectionId,
        quantity: raceOrderQuantity,
      },
    ],
    paymentProvider: racePaymentProvider,
  });

  const orderResponse = http.post(
    `${baseUrl}/api/ticket-orders`,
    createOrderPayload,
    {
      headers: buildAuthHeaders(),
    },
  );

  check(orderResponse, {
    "race order response accepted": (r) =>
      r.status === 201 ||
      r.status === 409 ||
      r.status === 404 ||
      r.status === 422,
  });

  if (!enableRacePayment || orderResponse.status !== 201) {
    sleep(0.05);
    return;
  }

  let orderId;
  try {
    const orderJson = orderResponse.json();
    orderId = orderJson?.data?.id;
  } catch {
    sleep(0.05);
    return;
  }

  if (!orderId) {
    sleep(0.05);
    return;
  }

  const paymentPayload = JSON.stringify({
    orderId,
    idempotencyKey: `k6-race-payment-${__VU}-${__ITER}-${Date.now()}`,
    provider: racePaymentProvider,
    // Mark load-test payment creation so backend suppresses ticket email side effects.
    simulatorCode: "k6-success",
  });

  const paymentResponse = http.post(
    `${baseUrl}/api/payment-transactions`,
    paymentPayload,
    {
      headers: buildAuthHeaders(),
    },
  );

  check(paymentResponse, {
    "race payment create accepted": (r) =>
      r.status === 201 || r.status === 404 || r.status === 409,
  });

  sleep(0.05);
}
