import {getContractKitWithAgent} from "@planq-network/phone-number-privacy-common";
import * as functions from "firebase-functions";
import config, {USE_FIREBASE} from "./config";
import {startCombiner} from "./server";

require("dotenv").config();

if (!USE_FIREBASE) {
  const server = startCombiner(
    config,
    getContractKitWithAgent(config.blockchain)
  );
  const port = 4466;
  const backupTimeout = config.domains.fullNodeTimeoutMs * 1.2;
  server
    .listen(port, () => {
      console.log(`Server is listening on port ${port}`);
    })
    .setTimeout(backupTimeout);
}
export const combiner = functions
  .region("us-central1")
  .runWith({
    // Keep instances warm for mainnet functions
    // Defined check required for running tests vs. deployment
    minInstances: functions.config().service
      ? Number(functions.config().service.min_instances)
      : 0,
  })
  .https.onRequest(
    startCombiner(config, getContractKitWithAgent(config.blockchain))
  );

export * from "./config";
