/// <reference types="vite/client" />

// Static media assets imported as URL strings by Vite.
declare module "*.mp3" {
  const src: string;
  export default src;
}
declare module "*.ogg" {
  const src: string;
  export default src;
}
