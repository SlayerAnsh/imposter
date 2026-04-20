import { z } from "zod";

export const JoinBody = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "display name required")
    .max(32, "display name too long"),
});

export const LeaveBody = z.object({
  peerId: z.string().min(1),
});

const IceCandidate = z
  .object({
    candidate: z.string().optional(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
  })
  .nullable();

export const RelayBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("offer"),
    from: z.string().min(1),
    to: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("answer"),
    from: z.string().min(1),
    to: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("ice"),
    from: z.string().min(1),
    to: z.string().min(1),
    candidate: IceCandidate,
  }),
]);
