export type PeerId = string;

export interface OfferSignal {
  type: "offer";
  from: PeerId;
  to: PeerId;
  sdp: string;
}

export interface AnswerSignal {
  type: "answer";
  from: PeerId;
  to: PeerId;
  sdp: string;
}

export interface IceSignal {
  type: "ice";
  from: PeerId;
  to: PeerId;
  candidate: RTCIceCandidateInit | null;
}

export interface PeerJoinedSignal {
  type: "peer_joined";
  peerId: PeerId;
  displayName: string;
}

export interface PeerLeftSignal {
  type: "peer_left";
  peerId: PeerId;
}

export interface HelloSignal {
  type: "hello";
  peerId: PeerId;
  role: "host" | "guest";
}

export type ServerToClientSignal =
  | OfferSignal
  | AnswerSignal
  | IceSignal
  | PeerJoinedSignal
  | PeerLeftSignal
  | HelloSignal;

export type ClientToServerSignal = OfferSignal | AnswerSignal | IceSignal;

export interface CreateRoomResponse {
  roomCode: string;
  hostId: PeerId;
}

export interface JoinRoomResponse {
  peerId: PeerId;
  hostId: PeerId;
}
