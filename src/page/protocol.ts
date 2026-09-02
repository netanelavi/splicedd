// What the two halves of the tap say to each other.
//
// The half that watches splice.com's traffic has to run in the page's own
// JavaScript world, where it can't reach a single extension API; the half that
// acts on what it sees runs in the extension's world, where it can't see the
// page's `fetch`. A `postMessage` is the only channel between them, so this is
// the one thing both sides import.

/** Marks a message as ours: anything on the page can post to this window. */
export const TAP_SOURCE = "splicedd-tap";

/** Something splice.com asked the network for. */
export type TapMessage =
  /** The body of a GraphQL response, which is where samples come from. */
  | { kind: "graphql"; body: string }

  /** The URL of an audio file the page requested, i.e. started playing. */
  | { kind: "audio"; url: string };

export type TapEnvelope = TapMessage & { source: typeof TAP_SOURCE };
