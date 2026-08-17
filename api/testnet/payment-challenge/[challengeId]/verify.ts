import { challengeIdSchema } from "../../../../src/testnet/contracts.js";
import { testnetProvider } from "../../../_lib/testnetProvider.js";
import { handleApi, pathParameter, requireMethod, sendJson, type ApiRequest, type ApiResponse } from "../../../_lib/http.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await handleApi(response, async () => {
    requireMethod(request, "POST");
    const challengeId = challengeIdSchema.parse(pathParameter(request, "challengeId"));
    const verification = await testnetProvider().verifyPayment(challengeId);
    sendJson(response, 200, verification);
  });
}
