// BR-163: the AES-256 ZIP plugin ships no types. archiver takes it as an opaque format
// module (a constructor it instantiates itself), so a nominal declaration is enough.
declare module "archiver-zip-encrypted" {
  const format: new (...args: never[]) => unknown;
  export default format;
}
