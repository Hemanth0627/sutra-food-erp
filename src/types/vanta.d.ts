declare module "vanta/dist/vanta.net.min" {
  export interface VantaEffect {
    destroy(): void;
    resize(): void;
    setOptions(options: Record<string, unknown>): void;
  }
  const NET: (options: Record<string, unknown>) => VantaEffect;
  export default NET;
}
