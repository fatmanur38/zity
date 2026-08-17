import { z } from "zod";
import { testnetProvider } from "../../_lib/testnetProvider";
import { handleApi, pathParameter, requireMethod, sendJson, type ApiRequest, type ApiResponse } from "../../_lib/http";

const txidSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  await handleApi(response, async () => {
    requireMethod(request, "GET");
    const txid = txidSchema.parse(pathParameter(request, "txid"));
    const transaction = await testnetProvider().getTransaction(txid);
    sendJson(response, 200, transaction);
  });
}
