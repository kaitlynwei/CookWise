const { runCatalogRefresh } = require("./recipe-catalog");

const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_START_DELAY_MS = 1_000;

function refreshSummary(result) {
  if (result.status !== "refreshed") return "Catalog refresh skipped: " + result.reason + ".";
  return "Catalog refresh complete: " + result.reviewed +
    " candidates reviewed across " + result.topics +
    " rotating topics, " + result.added + " added, " +
    result.updated + " updated, " + result.total + " total.";
}

function startCatalogScheduler(options) {
  const {
    database,
    apiKey,
    fetchImpl,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    startDelayMs = DEFAULT_START_DELAY_MS,
    logger = console
  } = options;
  let stopped = false;

  async function checkNow() {
    if (stopped) return { status: "skipped", reason: "stopped" };
    try {
      const result = await runCatalogRefresh({ database, apiKey, fetchImpl });
      if (result.status === "refreshed") logger.log(refreshSummary(result));
      return result;
    } catch (error) {
      logger.error("Automatic catalog refresh failed: " + error.message);
      return { status: "failed", error };
    }
  }

  const startTimer = setTimeout(checkNow, startDelayMs);
  startTimer.unref?.();
  const interval = setInterval(checkNow, checkIntervalMs);
  interval.unref?.();

  return {
    checkNow,
    stop() {
      stopped = true;
      clearTimeout(startTimer);
      clearInterval(interval);
    }
  };
}

module.exports = {
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_START_DELAY_MS,
  refreshSummary,
  startCatalogScheduler
};
