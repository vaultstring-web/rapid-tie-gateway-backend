import NodeCache from 'node-cache';

// TTL = 300 seconds (5 minutes) by default
export const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });