import { explainApiFailure } from './apiReachability';

export function getAuthErrorMessage(error, fallback) {
  const data = error.response?.data;
  const serverMsg = data?.message || data?.error;
  if (serverMsg && typeof serverMsg === 'string') return serverMsg;

  if (!error.response) {
    const reach = explainApiFailure(error);
    if (reach) return reach;
  }

  if (error.response?.status === 503) {
    return serverMsg || 'Server or database is unavailable. Start MongoDB and restart the backend.';
  }

  return fallback;
}
