/**
DEV only so linter stops screaming at me
 */
declare module "*.css";

declare module "*.riv" {
  const url: string;
  export default url;
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.png" {
  const url: string;
  export default url;
}
