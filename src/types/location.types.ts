// Shared types for location sharing feature

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationUpdate {
  id: string;
  sessionId: string;
  userId: string;
  latitude: string;
  longitude: string;
  distance: string | null;
  accuracy?: number; // GPS accuracy in meters
  createdAt: string;
}

export interface LocationSession {
  id: string;
  conversationId: string;
  participant1Id: string;
  participant2Id: string;
  participant1Sharing: boolean;
  participant2Sharing: boolean;
  participant1StartedAt: string | null;
  participant1StoppedAt: string | null;
  participant2StartedAt: string | null;
  participant2StoppedAt: string | null;
  status: "active" | "ended";
  createdAt: string;
  updatedAt: string;
}

export interface DistanceInfo {
  distance: string; // e.g., "5.2 km"
  distanceValue: number; // in meters
  duration: string; // e.g., "15 mins"
  durationValue: number; // in seconds
}

// Socket event payloads
export interface LocationSharingStartedPayload {
  conversationId: string;
  sessionId: string;
  userId: string;
  timestamp: string;
}

export interface LocationSharingStoppedPayload {
  conversationId: string;
  sessionId: string;
  userId: string;
  timestamp: string;
}

export interface LocationUpdatedPayload {
  conversationId: string;
  sessionId: string;
  userId: string;
  location: LocationCoordinates;
  distance: string | null;
  duration: string | null;
  timestamp: string;
}

export interface UpdateLocationData {
  conversationId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}
