import type { PeerId, ServerToClientSignal } from "./signaling-protocol";
import type { SignalingClient } from "./signaling-client";

const DEFAULT_ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export interface HostPeerHandle {
  peerId: PeerId;
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  displayName: string;
  ready: Promise<void>;
  close: () => void;
}

export interface HostManagerOptions {
  signaling: SignalingClient;
  hostId: PeerId;
  rtcConfig?: RTCConfiguration;
  onPeerReady: (handle: HostPeerHandle) => void;
  onPeerClosed: (peerId: PeerId) => void;
  onChannelMessage: (peerId: PeerId, data: string) => void;
  onError?: (err: unknown) => void;
}

export class HostPeerManager {
  private peers = new Map<PeerId, HostPeerHandle>();
  constructor(private readonly opts: HostManagerOptions) {}

  handleSignal(msg: ServerToClientSignal): void {
    switch (msg.type) {
      case "peer_joined":
        void this.createOutboundConnection(msg.peerId, msg.displayName);
        return;
      case "answer": {
        const h = this.peers.get(msg.from);
        if (!h) return;
        void h.connection.setRemoteDescription({
          type: "answer",
          sdp: msg.sdp,
        });
        return;
      }
      case "ice": {
        const h = this.peers.get(msg.from);
        if (!h) return;
        if (msg.candidate) {
          void h.connection.addIceCandidate(msg.candidate).catch(() => {});
        }
        return;
      }
      case "peer_left": {
        const h = this.peers.get(msg.peerId);
        h?.close();
        this.peers.delete(msg.peerId);
        this.opts.onPeerClosed(msg.peerId);
        return;
      }
      default:
        return;
    }
  }

  private async createOutboundConnection(
    peerId: PeerId,
    displayName: string,
  ): Promise<void> {
    const pc = new RTCPeerConnection(this.opts.rtcConfig ?? DEFAULT_ICE);
    const channel = pc.createDataChannel("game", { ordered: true });
    let resolveReady!: () => void;
    const ready = new Promise<void>((res) => (resolveReady = res));

    const handle: HostPeerHandle = {
      peerId,
      connection: pc,
      channel,
      displayName,
      ready,
      close: () => {
        try {
          channel.close();
        } catch {}
        try {
          pc.close();
        } catch {}
      },
    };
    this.peers.set(peerId, handle);

    channel.onopen = () => {
      resolveReady();
      this.opts.onPeerReady(handle);
    };
    channel.onmessage = (ev) => {
      this.opts.onChannelMessage(peerId, String(ev.data));
    };
    channel.onclose = () => {
      this.peers.delete(peerId);
      this.opts.onPeerClosed(peerId);
    };

    pc.onicecandidate = (ev) => {
      void this.opts.signaling
        .send({
          type: "ice",
          from: this.opts.hostId,
          to: peerId,
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        })
        .catch((err) => this.opts.onError?.(err));
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected" ||
        pc.connectionState === "closed"
      ) {
        handle.close();
        this.peers.delete(peerId);
        this.opts.onPeerClosed(peerId);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.opts.signaling.send({
        type: "offer",
        from: this.opts.hostId,
        to: peerId,
        sdp: offer.sdp ?? "",
      });
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  send(peerId: PeerId, data: string): void {
    const h = this.peers.get(peerId);
    if (h && h.channel.readyState === "open") h.channel.send(data);
  }

  broadcast(data: string): void {
    for (const h of this.peers.values()) {
      if (h.channel.readyState === "open") h.channel.send(data);
    }
  }

  closeAll(): void {
    for (const h of this.peers.values()) h.close();
    this.peers.clear();
  }

  peerIds(): PeerId[] {
    return [...this.peers.keys()];
  }
}

export interface GuestPeerOptions {
  signaling: SignalingClient;
  peerId: PeerId;
  hostId: PeerId;
  rtcConfig?: RTCConfiguration;
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
  onError?: (err: unknown) => void;
}

export class GuestPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  constructor(private readonly opts: GuestPeerOptions) {
    this.pc = new RTCPeerConnection(opts.rtcConfig ?? DEFAULT_ICE);
    this.pc.ondatachannel = (ev) => this.attachChannel(ev.channel);
    this.pc.onicecandidate = (ev) => {
      void opts.signaling
        .send({
          type: "ice",
          from: opts.peerId,
          to: opts.hostId,
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        })
        .catch((err) => opts.onError?.(err));
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        opts.onClose();
      }
    };
  }

  private attachChannel(ch: RTCDataChannel): void {
    this.channel = ch;
    ch.onopen = () => this.opts.onOpen();
    ch.onmessage = (ev) => this.opts.onMessage(String(ev.data));
    ch.onclose = () => this.opts.onClose();
  }

  async handleSignal(msg: ServerToClientSignal): Promise<void> {
    if (msg.type === "offer" && msg.from === this.opts.hostId) {
      await this.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.opts.signaling.send({
        type: "answer",
        from: this.opts.peerId,
        to: this.opts.hostId,
        sdp: answer.sdp ?? "",
      });
    } else if (msg.type === "ice" && msg.from === this.opts.hostId) {
      if (msg.candidate) {
        await this.pc.addIceCandidate(msg.candidate).catch(() => {});
      }
    }
  }

  send(data: string): void {
    if (this.channel && this.channel.readyState === "open") {
      this.channel.send(data);
    }
  }

  close(): void {
    try {
      this.channel?.close();
    } catch {}
    try {
      this.pc.close();
    } catch {}
  }
}
