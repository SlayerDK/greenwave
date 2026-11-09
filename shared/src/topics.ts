const ROOT = "greenwave/v1";

export const observationTopic = (cityId: string, routeId: string) =>
  `${ROOT}/${cityId}/routes/${routeId}/observations`;
export const stateTopic = (cityId: string, routeId: string) =>
  `${ROOT}/${cityId}/routes/${routeId}/state`;
export const statusTopic = (cityId: string) =>
  `${ROOT}/${cityId}/adapter/status`;

/** The backend's shared subscription: the broker hands each message to one copy. */
export const SHARED_OBSERVATIONS = `$share/backend/${ROOT}/+/routes/+/observations`;
export const ALL_STATES = `${ROOT}/+/routes/+/state`;
export const ALL_STATUSES = `${ROOT}/+/adapter/status`;

/** The browser learns which city went offline from the topic alone. */
export const cityOfStatusTopic = (topic: string) => topic.split("/")[2];
