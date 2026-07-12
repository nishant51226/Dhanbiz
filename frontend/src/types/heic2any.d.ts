declare module "heic2any" {
  type Heic2anyOptions = {
    blob: Blob;
    toType?: string;
    quality?: number;
  };

  function heic2any(options: Heic2anyOptions): Promise<Blob | Blob[]>;

  export default heic2any;
}
