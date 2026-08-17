import { createPaymentChallengeInputSchema } from "../../../src/testnet/contracts";
import { testnetProvider } from "../../_lib/testnetProvider";
import { handleApi, readJsonBody, requireMethod, sendJson, type ApiRequest, type ApiResponse } from "../../_lib/http";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await handleApi(response, async () => {
    requireMethod(request, "POST");
    const input = createPaymentChallengeInputSchema.parse(await readJsonBody(request));
    const challenge = await testnetProvider().createPaymentChallenge(input);
    sendJson(response, 201, challenge);
  });
}
