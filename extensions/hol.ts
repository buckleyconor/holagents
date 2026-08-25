/**
 * holagent extension — registers the deterministic surface of the package:
 *   tools:    hol_validate, hol_status, hol_scores
 *   commands: /hol-validate, /hol-status
 *
 * Implemented at M4. This stub keeps the pi manifest path valid from M0.
 */
export default function (pi: {
  registerTool?: (def: unknown) => void;
  registerCommand?: (name: string, opts: unknown) => void;
}) {
  // M4: register tools and commands.
  void pi;
}
