declare module "virtual:huhu-homarr/constants" {
  export const LOGICAL_GRID_PITCH: typeof import("../../sources/homarr/apps/nextjs/src/components/board/layout/constants").LOGICAL_GRID_PITCH;
}
declare module "virtual:huhu-homarr/geometry" {
  type GeometryModule = typeof import("../../sources/homarr/apps/nextjs/src/components/board/layout/geometry");
  export const getLayoutRowCount: GeometryModule["getLayoutRowCount"];
  export const getLogicalItemStyle: GeometryModule["getLogicalItemStyle"];
}
declare module "virtual:huhu-homarr/reflow" {
  type ReflowModule = typeof import("../../sources/homarr/apps/nextjs/src/components/board/layout/reflow");
  export const placeGridItem: ReflowModule["placeGridItem"];
  export const sortGridPlacementsForReadingOrder: ReflowModule["sortGridPlacementsForReadingOrder"];
}
