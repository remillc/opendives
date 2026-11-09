// Stand-in for the native plugin 'opendives-core' in the Node tests: any call
// answers with an empty object. The tests never reach the core.
export const OpenDivesCore = new Proxy({}, { get: () => async () => ({}) });
