import { challengeIdSchema } from "../../../../src/testnet/contracts";
import { testnetProvider } from "../../../_lib/testnetProvider";
import { handleApi, pathParameter, requireMethod, sendJson, type ApiRequest, type ApiResponse } from "../../../_lib/http";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await handleApi(response, async () => {
    requireMethod(request, "GET");
    const challengeId = challengeIdSchema.parse(pathParameter(request, "challengeId"));
    const status = await testnetProvider().getPaymentChallengeStatus(challengeId);
    sendJson(response, 200, status);
  });
}
