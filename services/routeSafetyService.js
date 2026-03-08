import { API_BASE_URL } from '../api';

const FALLBACK_SAFE_ROUTE_ENDPOINT = 'http://YOUR_BACKEND_IP:8000/safe-route';

export const getRouteSafety = async ({
  origin_lat,
  origin_lng,
  destination_lat,
  destination_lng,
  timestamp,
  routes,
}) => {
  if (!Array.isArray(routes) || routes.length === 0) {
    return [];
  }

  const endpoint =
    typeof API_BASE_URL === 'string' && API_BASE_URL.trim().length > 0
      ? `${API_BASE_URL}/safe-route`
      : FALLBACK_SAFE_ROUTE_ENDPOINT;

  const payload = {
    origin_lat,
    origin_lng,
    destination_lat,
    destination_lng,
    timestamp: timestamp || new Date().toISOString(),
    routes,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Safe route request failed with status ${response.status}`);
  }

  return response.json();
};
