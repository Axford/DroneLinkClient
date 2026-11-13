export type DiagnosticVector = readonly [number, number, number];

export interface DiagnosticSceneData {
  /** Half-width of the reference axes, in the same units as the vectors. */
  extent: number;
  samples?: readonly DiagnosticVector[];
  vector?: { from?: DiagnosticVector; to: DiagnosticVector };
  calibration?: { centre: DiagnosticVector; radii: DiagnosticVector };
}
