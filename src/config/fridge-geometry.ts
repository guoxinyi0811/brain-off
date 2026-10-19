/** Orthographic approximations from the supplied photos, in drawing units.
 * Relative visual positions, never physical measurements.
 * Geometry is presentation configuration, independent of inventory records.
 */
export interface RegionGeometry {
  locationId: string;
  x: number; y: number; width: number; height: number;
  shape: 'shelf' | 'drawer' | 'basket';
  mark: string;
  outline?: string;
}
export const fridgeGeometry = {
  width: 620,
  height: 750,
  frames: [
    { x: 26, y: 24, width: 260, height: 692, rx: 19, className: 'cabinet-outline' },
    { x: 39, y: 38, width: 234, height: 438, rx: 11, className: 'inner-outline' },
    { x: 132, y: 48, width: 48, height: 3, rx: 1.5, className: 'interior-light' },
    { x: 334, y: 24, width: 244, height: 466, rx: 17, className: 'door-outline' },
    { x: 343, y: 35, width: 226, height: 444, rx: 11, className: 'inner-outline' },
  ],
  lines: [
    { d: 'M26 490H286 M26 496H286', className: 'frame-line' },
    { d: 'M44 716V724H64V716 M248 716V724H268V716', className: 'frame-line' },
    { d: 'M306 43H319 M306 461H319', className: 'hinge-line' },
  ],
  captions: [{ x: 156, y: 510, text: '冷冻' }],
  regions: [
    { locationId: 'upper-shelf', x: 48, y: 72, width: 216, height: 76, shape: 'shelf', mark: '01' },
    { locationId: 'lower-shelf', x: 48, y: 150, width: 216, height: 76, shape: 'shelf', mark: '02' },
    { locationId: 'shelf-3', x: 48, y: 228, width: 216, height: 76, shape: 'shelf', mark: '03' },
    { locationId: 'shelf-4', x: 48, y: 306, width: 216, height: 76, shape: 'shelf', mark: '04' },
    { locationId: 'produce-drawer', x: 48, y: 390, width: 216, height: 78, shape: 'drawer', mark: '05' },
    { locationId: 'freezer-shelf', x: 48, y: 520, width: 216, height: 54, shape: 'drawer', mark: '01' },
    { locationId: 'freezer-drawer-2', x: 48, y: 580, width: 216, height: 54, shape: 'drawer', mark: '02' },
    { locationId: 'freezer-drawer-3', x: 48, y: 640, width: 216, height: 54, shape: 'drawer', mark: '03' },
    { locationId: 'door-top', x: 353, y: 70, width: 206, height: 57, shape: 'basket', mark: '01' },
    { locationId: 'door-upper-left', x: 353, y: 193, width: 92, height: 65, shape: 'basket', mark: '02' },
    { locationId: 'door-lower-left', x: 353, y: 291, width: 92, height: 68, shape: 'basket', mark: '03' },
    { locationId: 'door-right-tall', x: 454, y: 213, width: 105, height: 116, shape: 'basket', mark: '04' },
    { locationId: 'door-bottom', x: 353, y: 397, width: 206, height: 68, shape: 'basket', mark: '05' },
  ] satisfies RegionGeometry[],
};

export function regionOutline(region: RegionGeometry): string {
  if (region.outline) return region.outline;
  const w = region.width, h = region.height;
  if (region.shape === 'shelf') return `M 2 1 H ${w - 2} V ${h - 3} H 2 Z`;
  if (region.shape === 'drawer') return `M 2 4 H ${w - 2} V ${h - 10} Q ${w - 2} ${h - 3} ${w - 9} ${h - 3} H 9 Q 2 ${h - 3} 2 ${h - 10} Z`;
  return `M 2 8 Q 2 3 7 3 H ${w - 7} Q ${w - 2} 3 ${w - 2} 8 L ${w - 7} ${h - 12} Q ${w - 8} ${h - 4} ${w - 17} ${h - 3} H 17 Q 8 ${h - 4} 7 ${h - 12} Z`;
}
