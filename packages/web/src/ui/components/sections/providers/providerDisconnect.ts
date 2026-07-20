import { parseProviderDisconnectResponse } from '@contracts/opencode';

export const parseProviderDisconnectSuccess = (payload: unknown) => parseProviderDisconnectResponse(payload);
