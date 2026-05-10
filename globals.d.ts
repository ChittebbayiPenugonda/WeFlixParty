// Allow importing CSS files as side-effect modules
declare module '*.css' {
  const _: never;
  export default _;
}
