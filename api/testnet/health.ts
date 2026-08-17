import { configuredNetworkMode } from "../_lib/config.js";
import { testnetProvider } from "../_lib/testnetProvider.js";
import { handleApi, requireMethod, sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await handleApi(response, async () => {
    requireMethod(request, "GET");
    if (configuredNetworkMode() === "demo") {
      sendJson(response, 200, {
        network: "testnet",
        providerMode: "mock",
        connected: false,
        synced: false,
        blockHeight: null,
        walletAvailable: false,
        indexerAvailable: false,
        checkedAt: new Date().toISOString(),
        message: "Real testnet mode is disabled on this deployment.",
      });
      return;
    }
    const health = await testnetProvider().health();
    sendJson(response, 200, health);
  });
}
